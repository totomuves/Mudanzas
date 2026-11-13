import "server-only";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
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
  if (seller.status !== "approved") redirect("/vendedor");
  return { supabase, user, seller };
}

export const SELLER_STATUS_LABEL: Record<Seller["status"], string> = {
  pending: "En revisión",
  approved: "Aprobada",
  rejected: "Rechazada",
  suspended: "Suspendida",
};
