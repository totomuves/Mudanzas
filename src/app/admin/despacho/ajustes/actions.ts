"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/admin";
import { deleteVehicleFor, saveSettingsFor, saveVehicleFor, type FormState } from "@/lib/routing/manage";

const PATH = "/admin/despacho/ajustes";

export async function saveDeliverySettings(_prev: FormState, f: FormData): Promise<FormState> {
  await requireSection("despacho");
  const r = await saveSettingsFor(null, f);
  revalidatePath("/admin/despacho", "layout");
  return r;
}

export async function saveVehicle(_prev: FormState, f: FormData): Promise<FormState> {
  await requireSection("despacho");
  const r = await saveVehicleFor(null, f, null);
  revalidatePath(PATH);
  return r;
}

export async function deleteVehicle(f: FormData) {
  await requireSection("despacho");
  await deleteVehicleFor(null, String(f.get("id") ?? ""));
  revalidatePath(PATH);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type TeamRow = { email: string; is_owner: boolean; role_id: string | null; role_name: string | null; status: string };
type RoleRow = { id: string; name: string; sections: string[] };

/**
 * Agrega un chofer desde la pantalla de vehículos (solo administradores totales).
 * Usa un rol que tenga la sección Reparto; si no hay ninguno, crea el rol "Chofer".
 * Si la persona ya entró a la app aparece al tiro en la lista de choferes;
 * si no, queda invitada y aparece cuando entre con ese correo.
 */
export async function addDriver(_prev: FormState, f: FormData): Promise<FormState> {
  const { supabase, owner } = await requireSection("despacho");
  if (!owner) return { error: "Solo un administrador total puede agregar choferes." };
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { error: "Escribe un correo válido." };

  const [team, roles] = await Promise.all([supabase.rpc("list_team"), supabase.rpc("list_admin_roles")]);
  if (team.error || roles.error) return { error: "No se pudo leer el equipo. Intenta de nuevo." };
  const roleList = (roles.data ?? []) as RoleRow[];
  const current = ((team.data ?? []) as TeamRow[]).find((m) => m.email === email);

  if (current?.is_owner) {
    return current.status === "activo"
      ? { ok: `${email} es administrador total, así que ya puede ser chofer.` }
      : { ok: `${email} está invitado como administrador total: podrá ser chofer cuando entre a la app.` };
  }
  if (current?.role_id) {
    const role = roleList.find((r) => r.id === current.role_id);
    if (role?.sections.includes("reparto")) {
      return { ok: current.status === "activo" ? `${email} ya es chofer.` : `${email} ya está invitado como chofer. Aparecerá cuando entre a la app.` };
    }
    return {
      error: `${email} ya tiene el rol "${current.role_name ?? "sin nombre"}". En Admin → Equipo, edita ese rol y márcale la sección Reparto (chofer).`,
    };
  }

  let roleId =
    roleList.find((r) => r.sections.length === 1 && r.sections[0] === "reparto")?.id ??
    roleList.find((r) => r.name.trim().toLowerCase() === "chofer" && r.sections.includes("reparto"))?.id;
  if (!roleId) {
    const taken = roleList.some((r) => r.name.trim().toLowerCase() === "chofer");
    const created = await supabase.rpc("save_admin_role", { p_id: null, p_name: taken ? "Chofer (reparto)" : "Chofer", p_sections: ["reparto"] });
    if (created.error || !created.data) return { error: "No se pudo crear el rol Chofer. Intenta de nuevo." };
    roleId = created.data as string;
  }

  const { data, error } = await supabase.rpc("set_team_member", { p_email: email, p_role_id: roleId });
  if (error || data === "no_role") return { error: "No se pudo agregar. Intenta de nuevo." };
  revalidatePath(PATH);
  revalidatePath("/admin/equipo");
  if (data === "invited") {
    return {
      ok: `Invitación lista. Pídele a ${email} que entre a muveo.cl en "Ingresar" con ese mismo correo. Apenas entre, aparecerá aquí para asignarle un vehículo.`,
    };
  }
  return { ok: `Listo, ${email} ya es chofer. Ya puedes asignarle un vehículo.` };
}
