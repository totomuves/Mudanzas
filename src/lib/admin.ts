import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { ADMIN_SECTIONS, SECTION_KEYS, type AdminArea } from "@/lib/admin-sections";

type Supabase = Awaited<ReturnType<typeof getUser>>["supabase"];

/**
 * Secciones del admin que puede usar la persona.
 * Administrador total: todas, más "equipo". Con rol: las de su rol.
 * Si la migración de roles todavía no se corre, cae al permiso is_admin de siempre.
 */
export async function getAdminSections(supabase: Supabase, userId: string): Promise<{ owner: boolean; sections: AdminArea[] }> {
  const { data, error } = await supabase.rpc("admin_sections");
  if (!error && Array.isArray(data)) {
    const sections = data as AdminArea[];
    return { owner: sections.includes("equipo"), sections };
  }
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
  return profile?.is_admin
    ? { owner: true, sections: [...SECTION_KEYS, "equipo"] }
    : { owner: false, sections: [] };
}

/** Acceso de quien navega (una vez por request). */
export const getAdminAccess = cache(async () => {
  const { supabase, user } = await getUser();
  if (!user || user.is_anonymous) return { supabase, user, owner: false, sections: [] as AdminArea[] };
  return { supabase, user, ...(await getAdminSections(supabase, user.id)) };
});

/** Primera página del admin a la que la persona puede entrar. */
export function firstAdminHref(sections: AdminArea[]) {
  return ADMIN_SECTIONS.find((s) => sections.includes(s.key))?.href ?? (sections.includes("equipo") ? "/admin/equipo" : null);
}

/**
 * Exige permiso para una sección del admin; si no, redirige:
 * a otra sección que sí tenga, a su panel de vendedor o a "sin permiso".
 */
export async function requireSection(section: AdminArea) {
  const { supabase, user, owner, sections } = await getAdminAccess();
  if (!user || user.is_anonymous) redirect("/ingresar?next=/admin");
  if (!sections.includes(section)) {
    const other = firstAdminHref(sections);
    if (other) redirect(other);
    // Los vendedores que entran por /ingresar llegan aquí: los mandamos a su panel
    const { data: seller } = await supabase.from("sellers").select("id").eq("owner_id", user.id).maybeSingle();
    redirect(seller ? "/vendedor" : "/admin/sin-permiso");
  }
  return { supabase, user, owner, sections };
}

/** Solo administradores totales (pantalla Equipo). */
export function requireAdmin() {
  return requireSection("equipo");
}
