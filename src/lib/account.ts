import "server-only";
import { getUser } from "@/lib/supabase/server";
import { getAdminSections } from "@/lib/admin";

export type Account = {
  email: string;
  /** ¿Puede entrar al admin? (administrador total o alguien del equipo con un rol) */
  isAdmin: boolean;
  /** Estado de la tienda si la persona es vendedora, o null si no tiene. */
  sellerStatus: "pending" | "approved" | "rejected" | "suspended" | null;
  /** ¿Está encendido el marketplace? Si no, se ocultan los enlaces de vendedores. */
  marketplace: boolean;
} | null;

/** Cuenta de la persona que navega (null si no ha ingresado con su correo). */
export async function getAccount(): Promise<Account> {
  try {
    const { supabase, user } = await getUser();
    if (!user || user.is_anonymous || !user.email) return null;
    const [{ sections }, { data: seller }, { data: marketplace }] = await Promise.all([
      getAdminSections(supabase, user.id),
      supabase.from("sellers").select("status").eq("owner_id", user.id).maybeSingle(),
      supabase.rpc("marketplace_enabled"),
    ]);
    return {
      email: user.email,
      isAdmin: sections.length > 0,
      sellerStatus: (seller?.status as NonNullable<Account>["sellerStatus"]) ?? null,
      marketplace: marketplace === true,
    };
  } catch {
    return null;
  }
}
