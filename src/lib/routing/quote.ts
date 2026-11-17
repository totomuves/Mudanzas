import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMUNAS } from "@/lib/comunas";
import { orderLoad, santiagoToDate, upcomingDeliveryDates, addDays, santiagoParts, type DeliverySettings, type Vehicle } from "@/lib/delivery";
import {
  DEFAULT_PRICING, presetFleet, priceFromCost, rankVehicles, readPricing, type Load, type PricingSettings, type TripCost,
} from "@/lib/shipping-pricing";
import { SANTIAGO_CENTER, comunaCenter, geocode, travelMatrix, type GeoSource, type Point } from "./geo";
import { depotPoint, getVehicles, readDeliverySettings, type SellerScope } from "./planner";

/**
 * PRECIO DE DESPACHO AUTOMÁTICO
 * Calcula el costo real de llevar una carga desde la bodega (de MUVEO o de
 * cada vendedor) hasta la dirección, con el vehículo más barato que sirva.
 * La ganancia, el mínimo y la distancia máxima son las de MUVEO.
 */

type Db = ReturnType<typeof createAdminClient>;

/** Ajustes de precio de despacho (si falta la migración, queda en "fijo"). */
export async function getPricing(db: Db = createAdminClient()): Promise<PricingSettings> {
  const { data, error } = await db
    .from("delivery_settings")
    .select("pricing_mode, margin_pct, min_price, max_km, round_to, trip_share_pct")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return DEFAULT_PRICING;
  return readPricing(data);
}

// Direcciones ya buscadas (evita repetir búsquedas mientras el comprador escribe)
const geoCache = new Map<string, Point & { source: GeoSource }>();
async function cachedGeocode(address: string, comuna: string) {
  const k = `${address.toLowerCase().replace(/\s+/g, " ").trim()}|${comuna}`;
  const hit = geoCache.get(k);
  if (hit) return hit;
  const p = await geocode(address, comuna);
  if (geoCache.size > 500) geoCache.delete(geoCache.keys().next().value!);
  geoCache.set(k, p);
  return p;
}

export type GroupQuote =
  | {
      ok: true;
      price: number;
      best: TripCost;
      options: TripCost[];
      kmOneWay: number;
      minOneWay: number;
      source: "google" | "estimado";
      geoSource: GeoSource;
      usingPresets: boolean;
    }
  | { ok: false; reason: "far" | "comuna"; kmOneWay?: number };

/** Precio de llevar una carga desde la bodega de un scope (null = MUVEO). */
export async function quoteLoad(args: {
  load: Load;
  address: string;
  comuna: string;
  sellerId?: SellerScope;
  pricing?: PricingSettings;
  db?: Db;
}): Promise<GroupQuote> {
  const db = args.db ?? createAdminClient();
  const sellerId = args.sellerId ?? null;
  if (!COMUNAS.includes(args.comuna)) return { ok: false, reason: "comuna" };
  const pricing = args.pricing ?? (await getPricing(db));

  const { settings: own } = await readDeliverySettings(db, sellerId);
  // Si el vendedor aún no configura su reparto, se usa la bodega de MUVEO como referencia
  const settings: DeliverySettings | null = own ?? (sellerId ? (await readDeliverySettings(db, null)).settings : null);
  const depot = settings ? await depotPoint(db, settings, own ? sellerId : null) : SANTIAGO_CENTER;

  const dest = args.address.trim().length >= 5 ? await cachedGeocode(args.address, args.comuna) : { ...comunaCenter(args.comuna), source: "comuna" as GeoSource };

  // Salida a media mañana del próximo día de despacho (el tráfico de esa hora)
  const DEP = 11 * 3600;
  const day = (settings ? upcomingDeliveryDates(settings, new Date(), 1)[0] : null) ?? addDays(santiagoParts(new Date()).date, 1);
  const m = await travelMatrix([depot, dest], santiagoToDate(day, DEP), DEP);
  const f = m.source === "estimado" ? m.factor(DEP) : 1;
  const leg = {
    kmOut: m.dist[0][1] / 1000,
    kmBack: m.dist[1][0] / 1000,
    minOut: (m.dur[0][1] * f) / 60,
    minBack: (m.dur[1][0] * f) / 60,
  };
  if (leg.kmOut > pricing.max_km) return { ok: false, reason: "far", kmOneWay: leg.kmOut };

  let fleet: Vehicle[] = await getVehicles(db, true, sellerId).catch(() => []);
  const usingPresets = fleet.length === 0;
  if (usingPresets) fleet = presetFleet();

  const options = rankVehicles(fleet, args.load, leg, settings?.service_minutes ?? 12);
  const best = options[0];
  return {
    ok: true,
    price: priceFromCost(best.cost, pricing),
    best,
    options,
    kmOneWay: leg.kmOut,
    minOneWay: leg.minOut,
    source: m.source,
    geoSource: dest.source,
    usingPresets,
  };
}

type ProductLoadRow = {
  id: string;
  seller_id: string | null;
  size: string | null;
  category_slug: string | null;
  weight_kg: number | null;
  volume_m3: number | null;
};

export type CartQuote =
  | { ok: true; total: number; groups: { sellerId: string | null; price: number }[]; byGroup: Record<string, number> }
  | { ok: false; reason: "far" | "comuna" | "empty" };

/**
 * Precio automático del despacho de un carrito: una entrega por bodega
 * (MUVEO y cada vendedor), cada una con su vehículo y distancia.
 * byGroup tiene la forma que espera place_cart: { muveo: 5990, "<id vendedor>": 4500 }.
 */
export async function quoteItems(items: { id: string; qty: number }[], comuna: string, address: string, db: Db = createAdminClient()): Promise<CartQuote> {
  if (!items.length) return { ok: false, reason: "empty" };
  const { data } = await db
    .from("products")
    .select("id, seller_id, size, category_slug, weight_kg, volume_m3")
    .in("id", items.map((i) => i.id));
  const rows = (data ?? []) as ProductLoadRow[];
  if (!rows.length) return { ok: false, reason: "empty" };

  const loads = new Map<string | null, Load>();
  for (const it of items) {
    const p = rows.find((r) => r.id === it.id);
    if (!p) continue;
    const l = orderLoad(p, it.qty);
    const k = p.seller_id ?? null;
    const a = loads.get(k) ?? { kg: 0, m3: 0, rank: 0, serviceMin: 0 };
    loads.set(k, { kg: a.kg + l.kg, m3: a.m3 + l.m3, rank: Math.max(a.rank, l.rank), serviceMin: a.serviceMin + l.serviceMin });
  }

  const pricing = await getPricing(db);
  const groups: { sellerId: string | null; price: number }[] = [];
  for (const [sellerId, load] of loads) {
    const q = await quoteLoad({ load, address, comuna, sellerId, pricing, db });
    if (!q.ok) return { ok: false, reason: q.reason };
    groups.push({ sellerId, price: q.price });
  }
  const byGroup = Object.fromEntries(groups.map((g) => [g.sellerId ?? "muveo", g.price]));
  return { ok: true, total: groups.reduce((a, g) => a + g.price, 0), groups, byGroup };
}
