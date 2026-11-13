"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";

export type TeamState = { ok?: string; error?: string };

export async function setAdmin(_prev: TeamState, formData: FormData): Promise<TeamState> {
  const { supabase, user } = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const makeAdmin = formData.get("make") === "1";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Escribe un correo válido." };
  if (!makeAdmin && email === user.email?.toLowerCase()) {
    return { error: "No puedes quitarte el permiso a ti mismo. Pídeselo a otro admin." };
  }

  const { data, error } = await supabase.rpc("set_admin_by_email", { p_email: email, p_is_admin: makeAdmin });
  if (error) return { error: "No se pudo actualizar. Intenta de nuevo." };
  revalidatePath("/admin/equipo");

  if (data === "not_found") {
    return {
      error: `${email} todavía no ha entrado a la app. Pídele que entre una vez en /ingresar con ese correo y luego vuelve a agregarlo aquí.`,
    };
  }
  if (data === "last_admin") return { error: "Debe quedar al menos un administrador." };
  return { ok: makeAdmin ? `Listo, ${email} ahora es administrador.` : `${email} ya no es administrador.` };
}
