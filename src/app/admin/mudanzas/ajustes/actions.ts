"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/admin";
import { DISTANCES } from "@/lib/moving";

export type SettingsState = { ok?: string; error?: string };

/** Número entero >= 0 desde el formulario (acepta "15.000"). */
function num(f: FormData, k: string, max: number) {
  const n = parseInt(String(f.get(k) ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : null;
}

export async function saveMovingSettings(_prev: SettingsState, f: FormData): Promise<SettingsState> {
  const { supabase } = await requireSection("mudanzas");

  const slots = Array.from(
    new Set(f.getAll("slot_times").map((v) => String(v).trim()).filter((v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v))),
  ).sort();
  if (slots.length === 0) return { error: "Agrega al menos un bloque horario." };

  const closed = f
    .getAll("closed_weekdays")
    .map((v) => parseInt(String(v), 10))
    .filter((n) => n >= 0 && n <= 6);
  if (closed.length === 7) return { error: "No puedes cerrar los 7 días de la semana." };

  const whatsappRaw = String(f.get("whatsapp") ?? "").replace(/\D/g, "");
  if (whatsappRaw && whatsappRaw.length < 8) return { error: "Revisa el número de WhatsApp." };
  // Si escriben 9 dígitos (912345678) se agrega el 56 de Chile
  const whatsapp = whatsappRaw.length === 9 && whatsappRaw.startsWith("9") ? `56${whatsappRaw}` : whatsappRaw;

  const distance_prices: Record<string, number> = {};
  for (const d of DISTANCES) distance_prices[d.key] = num(f, `dist_${d.key}`, 10_000_000) ?? 0;

  const fields = {
    crews_per_slot: num(f, "crews_per_slot", 50),
    min_notice_hours: num(f, "min_notice_hours", 24 * 30),
    booking_days_ahead: num(f, "booking_days_ahead", 365),
    price_per_floor: num(f, "price_per_floor", 1_000_000),
    packing_pct: num(f, "packing_pct", 300),
    heavy_item_price: num(f, "heavy_item_price", 5_000_000),
    weekend_surcharge_pct: num(f, "weekend_surcharge_pct", 300),
  };
  if (Object.values(fields).some((v) => v === null)) return { error: "Completa todos los números." };
  if (!fields.crews_per_slot) return { error: "Las mudanzas por bloque deben ser al menos 1." };
  if (!fields.booking_days_ahead) return { error: "Los días para reservar deben ser al menos 1." };

  const { error } = await supabase
    .from("moving_settings")
    .update({ ...fields, slot_times: slots, closed_weekdays: closed, distance_prices, whatsapp: whatsapp || null })
    .eq("id", 1);
  if (error) return { error: "No se pudo guardar. Intenta de nuevo." };

  revalidatePath("/admin/mudanzas/ajustes");
  revalidatePath("/mudanzas", "layout");
  return { ok: "Ajustes guardados. Ya se aplican en el cotizador." };
}
