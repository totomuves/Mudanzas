"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/admin";
import { orderLoad } from "@/lib/delivery";
import { quoteLoad } from "@/lib/routing/quote";
import { priceFromCost, readPricing } from "@/lib/shipping-pricing";

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
      return { error: "No pudimos guardar. ¿Ya corriste la migración 20261114150000_despacho_comunas.sql?" };
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

// -------------------------------------------------------------
// Precio fijo o automático
// -------------------------------------------------------------
export async function savePricing(_prev: ShippingState, formData: FormData): Promise<ShippingState> {
  const { supabase } = await requireSection("despacho");
  const num = (k: string) => Number(String(formData.get(k) ?? "").replace(/[^\d.,]/g, "").replace(",", "."));
  const mode = formData.get("pricing_mode") === "automatico" ? "automatico" : "fijo";
  const margin = num("margin_pct");
  const min = Math.round(num("min_price"));
  const maxKm = Math.round(num("max_km"));
  const roundTo = Math.round(num("round_to"));
  const share = Math.round(num("trip_share_pct"));
  if (!(margin >= 0 && margin <= 500)) return { error: "La ganancia debe estar entre 0% y 500%." };
  if (!(min >= 0 && min <= 1_000_000)) return { error: "Revisa el precio mínimo." };
  if (!(maxKm >= 1 && maxKm <= 1000)) return { error: "Revisa la distancia máxima." };
  if (!(roundTo >= 1 && roundTo <= 10000)) return { error: "Revisa el redondeo." };
  if (!(share >= 10 && share <= 100)) return { error: "La parte del viaje debe estar entre 10% y 100%." };

  const { error } = await supabase
    .from("delivery_settings")
    .update({ pricing_mode: mode, margin_pct: margin, min_price: min, max_km: maxKm, round_to: roundTo, trip_share_pct: share })
    .eq("id", 1);
  if (error) {
    console.error("[despacho] precio", error);
    return { error: "No pudimos guardar. ¿Ya corriste la migración 20261117100000_despacho_automatico.sql?" };
  }
  revalidatePath("/admin/despacho");
  revalidatePath("/comprar", "layout");
  revalidatePath("/carrito");
  revalidatePath("/envios");
  return { ok: mode === "automatico" ? "Listo: el despacho ahora se calcula solo." : "Listo: el despacho usa los precios por comuna." };
}

export type SimOption = {
  name: string;
  kind: string;
  trips: number;
  km: number;
  hours: number;
  fuel: number;
  tolls: number;
  crew: number;
  cost: number;
  price: number;
  /** Dónde se estaciona el vehículo (de ahí sale y ahí vuelve) */
  parking?: string;
};
export type SimResult = {
  error?: string;
  kmOneWay?: number;
  minOneWay?: number;
  source?: string;
  roads?: string;
  geoSource?: string;
  usingPresets?: boolean;
  bodega?: string;
  options?: SimOption[];
};

/** Simulador del admin: cuánto costaría y cobraría un despacho, y con qué vehículo. */
export async function simulateShipping(input: {
  comuna: string;
  address: string;
  size: string;
  quantity: number;
  kg?: number;
  m3?: number;
  warehouse_id?: string | null;
  margin_pct: number;
  min_price: number;
  max_km: number;
  round_to: number;
  trip_share_pct: number;
}): Promise<SimResult> {
  await requireSection("despacho");
  const pricing = readPricing({ pricing_mode: "automatico", ...input });
  const qty = Math.max(1, Math.min(50, Number(input.quantity) || 1));
  const base = orderLoad({ size: input.size, weight_kg: input.kg || null, volume_m3: input.m3 || null }, qty);
  try {
    const wh = input.warehouse_id && /^[0-9a-f-]{36}$/i.test(input.warehouse_id) ? input.warehouse_id : null;
    const q = await quoteLoad({ load: base, address: input.address ?? "", comuna: input.comuna, warehouseId: wh, pricing });
    if (!q.ok) {
      return {
        error: q.reason === "far"
          ? `Está a ${Math.round(q.kmOneWay ?? 0)} km de la bodega, más que la distancia máxima (${pricing.max_km} km).`
          : "Elige una comuna.",
      };
    }
    return {
      kmOneWay: q.kmOneWay,
      minOneWay: q.minOneWay,
      source: q.source,
      roads: q.roads,
      geoSource: q.geoSource,
      usingPresets: q.usingPresets,
      bodega: q.bodega,
      options: q.options.map((o) => ({
        parking: q.usingPresets ? undefined : q.parkings[o.vehicle.id],
        name: o.vehicle.name,
        kind: o.vehicle.kind,
        trips: o.trips,
        km: o.km,
        hours: o.hours,
        fuel: Math.round(o.fuel),
        tolls: Math.round(o.tolls),
        crew: Math.round(o.crew),
        cost: Math.round(o.cost),
        price: priceFromCost(o.cost, pricing),
      })),
    };
  } catch (e) {
    console.error("[despacho] simulador", e);
    return { error: "No pudimos calcular. Intenta de nuevo." };
  }
}
