import "server-only";
import { getUser } from "@/lib/supabase/server";

/** Para Route Handlers: ¿quien llama es administrador? */
export async function isAdminRequest() {
  const { supabase, user } = await getUser();
  if (!user || user.is_anonymous) return false;
  const { data } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  return Boolean(data?.is_admin);
}

/** Para las herramientas de fotos e IA: ¿es admin o un vendedor aprobado? */
export async function canUseProductTools() {
  const { supabase, user } = await getUser();
  if (!user || user.is_anonymous) return false;
  const [{ data: profile }, { data: sellerId }] = await Promise.all([
    supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(),
    supabase.rpc("my_seller_id"),
  ]);
  return Boolean(profile?.is_admin || sellerId);
}

/** Qué funciones de IA están activas según las variables de entorno. */
export function aiFeatures() {
  return {
    bgProvider: process.env.REMOVE_BG_API_KEY ? ("removebg" as const) : ("local" as const),
    suggest: Boolean(process.env.ANTHROPIC_API_KEY),
  };
}
