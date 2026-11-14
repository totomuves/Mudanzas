"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { SECTION_KEYS, type AdminSection } from "@/lib/admin-sections";

export type TeamState = { ok?: string; error?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f-]{36}$/i;

/** Crea o edita un rol con las secciones marcadas. */
export async function saveRole(_prev: TeamState, formData: FormData): Promise<TeamState> {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const sections = formData
    .getAll("sections")
    .map(String)
    .filter((s): s is AdminSection => (SECTION_KEYS as string[]).includes(s));
  if (name.length < 2) return { error: "Ponle un nombre al rol (por ejemplo: Diseño, Bodega)." };
  if (sections.length === 0) return { error: "Marca al menos una sección." };

  const { error } = await supabase.rpc("save_admin_role", {
    p_id: UUID.test(id) ? id : null,
    p_name: name,
    p_sections: sections,
  });
  if (error) {
    if (error.code === "23505") return { error: `Ya existe un rol llamado "${name}".` };
    return { error: "No se pudo guardar el rol. Intenta de nuevo." };
  }
  revalidatePath("/admin/equipo");
  return { ok: UUID.test(id) ? `Rol "${name}" actualizado.` : `Rol "${name}" creado. Ahora puedes invitar personas con este rol.` };
}

export async function deleteRole(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return;
  await supabase.rpc("delete_admin_role", { p_id: id });
  revalidatePath("/admin/equipo");
}

/** Invita a alguien o le cambia el rol. role = "owner" es administrador total. */
export async function setMember(_prev: TeamState, formData: FormData): Promise<TeamState> {
  const { supabase, user } = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");
  if (!EMAIL.test(email)) return { error: "Escribe un correo válido." };
  if (role !== "owner" && !UUID.test(role)) return { error: "Elige un rol." };
  if (role !== "owner" && email === user.email?.toLowerCase()) {
    return { error: "No puedes cambiar tu propio acceso. Pídeselo a otro administrador total." };
  }

  const { data, error } = await supabase.rpc("set_team_member", {
    p_email: email,
    p_role_id: role === "owner" ? null : role,
  });
  if (error) return { error: "No se pudo guardar. Intenta de nuevo." };
  revalidatePath("/admin/equipo");
  if (data === "no_role") return { error: "Ese rol ya no existe. Recarga la página." };
  if (data === "last_admin") return { error: "Debe quedar al menos un administrador total." };
  if (data === "invited") {
    return {
      ok: `Invitación guardada. Pídele a ${email} que entre a la app en "Ingresar" con ese mismo correo: al entrar tendrá su acceso.`,
    };
  }
  return { ok: `Listo, ${email} ya tiene su acceso.` };
}

/** Saca a alguien del equipo o cancela su invitación. */
export async function removeMember(_prev: TeamState, formData: FormData): Promise<TeamState> {
  const { supabase, user } = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { error: "Correo inválido." };
  if (email === user.email?.toLowerCase()) return { error: "No puedes quitarte el acceso a ti mismo." };
  const { data, error } = await supabase.rpc("remove_team_member", { p_email: email });
  if (error) return { error: "No se pudo quitar. Intenta de nuevo." };
  if (data === "last_admin") return { error: "Debe quedar al menos un administrador total." };
  revalidatePath("/admin/equipo");
  return { ok: `${email} ya no tiene acceso al admin.` };
}
