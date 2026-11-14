import "server-only";
import { getUser } from "@/lib/supabase/server";
import { getAdminSections } from "@/lib/admin";
import type { AdminArea } from "@/lib/admin-sections";

/** Para Route Handlers: ¿quien llama tiene alguna de estas secciones del admin? */
export async function hasAdminSection(...wanted: AdminArea[]) {
  const { supabase, user } = await getUser();
  if (!user || user.is_anonymous) return false;
  const { sections } = await getAdminSections(supabase, user.id);
  return wanted.some((w) => sections.includes(w));
}

/** Para las herramientas de fotos e IA: ¿puede editar productos o es un vendedor aprobado? */
export async function canUseProductTools() {
  const { supabase, user } = await getUser();
  if (!user || user.is_anonymous) return false;
  const [{ sections }, { data: sellerId }] = await Promise.all([
    getAdminSections(supabase, user.id),
    supabase.rpc("my_seller_id"),
  ]);
  return Boolean(sections.includes("productos") || sellerId);
}

/** Qué funciones de IA están activas según las variables de entorno. */
export function aiFeatures() {
  return {
    bgProvider: process.env.REMOVE_BG_API_KEY ? ("removebg" as const) : ("local" as const),
    suggest: Boolean(process.env.ANTHROPIC_API_KEY),
  };
}
