import "server-only";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import type { Seller } from "@/lib/types";

/** Tienda del usuario actual (en cualquier estado) o null. */
export async function getMySeller() {
  const { supabase, user } = await getUser();
  if (!user || user.is_anonymous) return { supabase, user: null, seller: null };
  const { data } = await supabase.from("sellers").select("*").eq("owner_id", user.id).maybeSingle();
  return { supabase, user, seller: (data as Seller | null) ?? null };
}

/** Exige un vendedor aprobado; si no, lo manda a iniciar sesión o a registrarse. */
export async function requireSeller() {
  const { supabase, user, seller } = await getMySeller();
  if (!user) redirect("/ingresar?next=/vendedor");
  if (!seller) redirect("/vender");
  if (seller.status !== "approved" || !(await getMarketplaceEnabled())) redirect("/vendedor");
  return { supabase, user, seller };
}

/** ¿Está encendido el marketplace? (Admin → Vendedores). Apagado = solo vende MÜVEO. */
export async function getMarketplaceEnabled() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("marketplace_enabled");
    return !error && data === true;
  } catch {
    return false;
  }
}

export const SELLER_STATUS_LABEL: Record<Seller["status"], string> = {
  pending: "En revisión",
  approved: "Aprobada",
  rejected: "Rechazada",
  suspended: "Suspendida",
};
