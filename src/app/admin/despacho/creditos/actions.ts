"use server";

import { revalidatePath } from "next/cache";
import { getAdminAccess } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { setPickupCredit } from "@/lib/credits-server";

const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

async function requireDespacho() {
  const access = await getAdminAccess();
  if (!access.user || access.user.is_anonymous || !access.sections.includes("despacho")) return null;
  return access.user;
}

function refresh() {
  revalidatePath("/admin/despacho/creditos");
  revalidatePath("/admin/despacho/retiros");
  revalidatePath("/reparto/retiros");
}

function parseAmount(raw: FormDataEntryValue | null) {
  const n = parseInt(String(raw ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100_000) : 0;
}

export type CreditFormState = { error?: string; ok?: string };

/** Formulario "Dar créditos" en cada retiro. */
export async function assignPickupCredit(_prev: CreditFormState, f: FormData): Promise<CreditFormState> {
  const user = await requireDespacho();
  if (!user) return { error: "No tienes permiso para dar créditos." };
  const id = String(f.get("pickup_id") ?? "");
  if (!isId(id)) return { error: "Retiro inválido." };
  const amount = parseAmount(f.get("amount"));
  const error = await setPickupCredit(id, amount, user.id);
  if (error) return { error };
  refresh();
  return { ok: amount ? "Créditos guardados." : "Créditos quitados." };
}

/** Anula un código (deja de servir; lo ya pagado con él no cambia). */
export async function annulCredit(f: FormData) {
  if (!(await requireDespacho())) return;
  const id = String(f.get("id") ?? "");
  if (!isId(id)) return;
  await createAdminClient().from("store_credits").update({ status: "anulado" }).eq("id", id);
  refresh();
}

/** Alarga el vencimiento de un crédito activo. */
export async function extendCredit(f: FormData) {
  if (!(await requireDespacho())) return;
  const id = String(f.get("id") ?? "");
  const days = Math.max(1, Math.min(3650, parseInt(String(f.get("days") ?? "30"), 10) || 30));
  if (!isId(id)) return;
  const db = createAdminClient();
  const { data } = await db.from("store_credits").select("expires_at, status").eq("id", id).maybeSingle();
  if (!data || data.status !== "activo") return;
  const from = Math.max(Date.now(), new Date(data.expires_at as string).getTime());
  await db.from("store_credits").update({ expires_at: new Date(from + days * 86_400_000).toISOString() }).eq("id", id);
  refresh();
}

export async function saveCreditSettings(_prev: CreditFormState, f: FormData): Promise<CreditFormState> {
  if (!(await requireDespacho())) return { error: "No tienes permiso." };
  const days = parseInt(String(f.get("expiry_days") ?? ""), 10);
  if (!Number.isFinite(days) || days < 1 || days > 3650) return { error: "Los días de vigencia van de 1 a 3650." };
  const value = parseInt(String(f.get("credit_value") ?? "").replace(/\D/g, ""), 10);
  if (!Number.isFinite(value) || value < 1 || value > 1_000_000) return { error: "El valor de 1 crédito va de $1 a $1.000.000." };
  const { error } = await createAdminClient()
    .from("credit_settings")
    .upsert({ id: 1, enabled: f.get("enabled") === "on", expiry_days: days, credit_value: value, updated_at: new Date().toISOString() });
  if (error) return { error: "Falta correr la migración de créditos en Supabase (20261119100000_creditos_unidades.sql)." };
  refresh();
  return { ok: "Ajustes guardados. La vigencia nueva corre para los créditos que se activen desde ahora." };
}
