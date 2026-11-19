import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomInt } from "node:crypto";

/** Letras y números sin los que se confunden (0/O, 1/I/L). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Código nuevo de 10 caracteres (se guarda sin guiones). */
function newCreditCode() {
  return Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}


/**
 * Asigna (o cambia) los créditos de un retiro. Si el retiro aún no se hace,
 * quedan pendientes y se activan solos cuando el chofer lo marca como retirado.
 * Devuelve un texto de error o null.
 */
export async function setPickupCredit(pickupId: string, amount: number, userId: string): Promise<string | null> {
  const db = createAdminClient();
  const { data: pickup } = await db
    .from("pickups")
    .select("id, status, contact_name, contact_phone, contact_email")
    .eq("id", pickupId)
    .maybeSingle();
  if (!pickup) return "No encontramos el retiro.";
  if (pickup.status === "rechazado" || pickup.status === "cancelado") return "El retiro está rechazado o cancelado.";

  const { data: existing, error: readErr } = await db.from("store_credits").select("id, status").eq("pickup_id", pickupId).maybeSingle();
  if (readErr) return "Falta correr la migración de créditos en Supabase (20261118110000_creditos_retiros.sql).";

  if (existing && existing.status !== "anulado") {
    // Cambiar el monto. Si ya está activo y se usó, no puede quedar bajo lo usado.
    if (amount <= 0) {
      await db.from("store_credits").update({ status: "anulado" }).eq("id", existing.id);
      return null;
    }
    const { data: uses } = await db.from("store_credit_uses").select("amount, checkouts(status)").eq("credit_id", existing.id);
    const used = ((uses ?? []) as unknown as { amount: number; checkouts: { status: string } | null }[])
      .filter((u) => u.checkouts?.status === "paid")
      .reduce((a, u) => a + u.amount, 0);
    if (amount < used) return `Ya se usaron ${used.toLocaleString("es-CL")} de estos créditos; el monto no puede ser menor.`;
    const { error } = await db.from("store_credits").update({ amount }).eq("id", existing.id);
    return error ? error.message : null;
  }
  if (amount <= 0) return null;

  const { data: settings } = await db.from("credit_settings").select("expiry_days").eq("id", 1).maybeSingle();
  const days = settings?.expiry_days ?? 180;
  const done = pickup.status === "retirado";
  const now = new Date();
  const row = {
    amount,
    holder_name: pickup.contact_name,
    holder_phone: pickup.contact_phone,
    holder_email: pickup.contact_email ?? null,
    status: done ? "activo" : "pendiente",
    activated_at: done ? now.toISOString() : null,
    expires_at: done ? new Date(now.getTime() + days * 86_400_000).toISOString() : null,
    created_by: userId,
  };
  // El crédito anulado del mismo retiro se reutiliza (pickup_id es único)
  for (let i = 0; i < 3; i++) {
    const code = newCreditCode();
    const { error } = existing
      ? await db.from("store_credits").update({ ...row, code }).eq("id", existing.id)
      : await db.from("store_credits").insert({ ...row, code, pickup_id: pickupId });
    if (!error) return null;
    if (!error.message.includes("code")) return error.message;
  }
  return "No se pudo crear el código. Intenta de nuevo.";
}

/**
 * Valor oculto de 1 crédito en pesos, o null si los créditos están apagados
 * (o falta la migración). Sirve para mostrar el precio en créditos.
 */
export const getCreditValue = cache(async (): Promise<number | null> => {
  try {
    const { data, error } = await createAdminClient().from("credit_settings").select("enabled, credit_value").eq("id", 1).maybeSingle();
    if (error || !data?.enabled || !data.credit_value) return null;
    return data.credit_value as number;
  } catch {
    return null;
  }
});
