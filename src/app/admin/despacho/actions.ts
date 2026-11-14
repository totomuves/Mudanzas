"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/admin";

export type ShippingState = { ok?: string; error?: string };

/** Guarda todos los precios de una vez. Precio vacío = sin despacho en esa comuna. */
export async function saveShippingRates(_prev: ShippingState, formData: FormData): Promise<ShippingState> {
  const { supabase } = await requireSection("despacho");
  const comunas = formData.getAll("comuna").map((c) => String(c).trim().slice(0, 60)).filter(Boolean);

  const extra = String(formData.get("nueva_comuna") ?? "").trim().slice(0, 60);
  const extraPrice = String(formData.get("nueva_precio") ?? "").trim();

  const upserts: { comuna: string; price: number; active: boolean }[] = [];
  const removes: string[] = [];

  for (const comuna of comunas) {
    const raw = String(formData.get(`precio:${comuna}`) ?? "").replace(/\D/g, "");
    if (raw === "") {
      removes.push(comuna);
      continue;
    }
    const price = parseInt(raw, 10);
    if (price > 1_000_000) return { error: `Revisa el precio de ${comuna}.` };
    upserts.push({ comuna, price, active: formData.get(`activa:${comuna}`) === "on" });
  }

  if (extra) {
    const raw = extraPrice.replace(/\D/g, "");
    if (raw === "") return { error: `Escribe el precio para ${extra}.` };
    if (upserts.some((u) => u.comuna.toLowerCase() === extra.toLowerCase()) || comunas.some((c) => c.toLowerCase() === extra.toLowerCase())) {
      return { error: `${extra} ya está en la lista.` };
    }
    upserts.push({ comuna: extra, price: parseInt(raw, 10), active: true });
  }

  if (upserts.length > 0) {
    const { error } = await supabase.from("shipping_rates").upsert(upserts, { onConflict: "comuna" });
    if (error) {
      console.error("[despacho]", error);
      return { error: "No pudimos guardar. ¿Ya corriste la migración 20261114140000_despacho_comunas.sql?" };
    }
  }
  if (removes.length > 0) {
    const { error } = await supabase.from("shipping_rates").delete().in("comuna", removes);
    if (error) return { error: "No pudimos quitar algunas comunas. Intenta de nuevo." };
  }

  revalidatePath("/admin/despacho");
  revalidatePath("/comprar", "layout");
  return { ok: `Listo: ${upserts.length} comunas con despacho.` };
}
