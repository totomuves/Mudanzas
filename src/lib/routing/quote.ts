import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMUNAS } from "@/lib/comunas";
import { orderLoad, santiagoToDate, upcomingDeliveryDates, addDays, santiagoParts, type DeliverySettings, type Vehicle } from "@/lib/delivery";
import {
  DEFAULT_PRICING, presetFleet, priceFromCost, rankVehicles, readPricing, type Load, type PricingSettings, type TripCost,
} from "@/lib/shipping-pricing";
import { SANTIAGO_CENTER, comunaCenter, geocode, travelMatrix, type GeoSource, type Point } from "./geo";
import { depotPoint, getVehicles, readDeliverySettings, type SellerScope } from "./planner";
import { NodeIndex, getWarehouses, loadLogistics } from "./warehouses";

/** Minutos de carga en la bodega (igual que en las rutas). */
const LOAD_MINUTES = 10;

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
      /** Sin Google: km por calles reales (OSRM, gratis) o línea recta estimada */
      roads?: "osm" | "linea";
      geoSource: GeoSource;
      usingPresets: boolean;
      /** Bodega desde donde sale el producto */
      bodega: string;
      /** Parking de cada vehículo (id → nombre) */
      parkings: Record<string, string>;
    }
  | { ok: false; reason: "far" | "comuna"; kmOneWay?: number };

/** Precio de llevar una carga desde la bodega de un scope (null = MUVEO). */
export async function quoteLoad(args: {
  load: Load;
  /**
   * Productos de la misma compra por separado. Si vienen, se cobra el despacho del
   * producto más caro de llevar, una sola vez (regla de Andrés, 17 nov 2026).
   */
  items?: Load[];
  address: string;
  comuna: string;
  sellerId?: SellerScope;
  /** Bodega de MUVEO donde está el producto (null = la principal). */
  warehouseId?: string | null;
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

  let fleet: Vehicle[] = await getVehicles(db, true, sellerId).catch(() => []);
  const usingPresets = fleet.length === 0;
  if (usingPresets) fleet = presetFleet();

  // Bodega del producto y parking de cada vehículo: parking → bodega → dirección → parking
  const lg = await loadLogistics(db, sellerId, depot, settings, usingPresets ? [] : fleet);
  const bodega = sellerId ? lg.main : lg.bodegaOf(args.warehouseId);
  const idx = new NodeIndex();
  idx.add(bodega.key, bodega);
  idx.add("dest", dest);
  const parkNode = new Map(fleet.map((v) => [v.id, idx.add(lg.parkingOf(v).key, lg.parkingOf(v))]));

  // Salida a media mañana del próximo día de despacho (el tráfico de esa hora)
  const DEP = 11 * 3600;
  const day = (settings ? upcomingDeliveryDates(settings, new Date(), 1)[0] : null) ?? addDays(santiagoParts(new Date()).date, 1);
  const m = await travelMatrix(idx.points, santiagoToDate(day, DEP), DEP);
  const f = m.source === "estimado" ? m.factor(DEP) : 1;
  const km = (i: number, j: number) => m.dist[i][j] / 1000;
  const min = (i: number, j: number) => (m.dur[i][j] * f) / 60;
  const base = { kmOut: km(0, 1), kmBack: km(1, 0), minOut: min(0, 1), minBack: min(1, 0) };
  if (base.kmOut > pricing.max_km) return { ok: false, reason: "far", kmOneWay: base.kmOut };
  const legOf = (v: Vehicle) => {
    const p = parkNode.get(v.id) ?? 0;
    return { ...base, kmToStart: km(p, 0), minToStart: min(p, 0), kmHome: km(1, p), minHome: min(1, p), loadMin: lg.migrated ? LOAD_MINUTES : 0 };
  };

  const svc = settings?.service_minutes ?? 12;
  const loads = args.items && args.items.length > 0 ? args.items : [args.load];
  // Precio de cada producto por separado; se cobra el más caro
  let top: { price: number; options: TripCost[] } | null = null;
  for (const l of loads) {
    const options = rankVehicles(fleet, l, legOf, svc);
    const price = priceFromCost(options[0].cost, pricing);
    if (!top || price > top.price) top = { price, options };
  }
  const { price, options } = top!;
  const best = options[0];
  return {
    ok: true,
    price,
    best,
    options,
    kmOneWay: base.kmOut,
    minOneWay: base.minOut,
    source: m.source,
    roads: m.roads,
    geoSource: dest.source,
    usingPresets,
    bodega: bodega.name,
    parkings: Object.fromEntries(fleet.map((v) => [v.id, lg.parkingOf(v).name])),
  };
}

type ProductLoadRow = {
  id: string;
  seller_id: string | null;
  size: string | null;
  category_slug: string | null;
  weight_kg: number | null;
  volume_m3: number | null;
  warehouse_id?: string | null;
};

export type CartQuote =
  | { ok: true; total: number; groups: { sellerId: string | null; price: number }[]; byGroup: Record<string, number> }
  | { ok: false; reason: "far" | "comuna" | "empty" };

/**
 * Precio automático del despacho de un carrito: una entrega por bodega
 * (MUVEO y cada vendedor), cada una con su distancia. En cada bodega se cobra
 * una sola vez el despacho del producto más caro de llevar.
 * byGroup tiene la forma que espera place_cart: { muveo: 5990, "<id vendedor>": 4500 }.
 */
export async function quoteItems(items: { id: string; qty: number }[], comuna: string, address: string, db: Db = createAdminClient()): Promise<CartQuote> {
  if (!items.length) return { ok: false, reason: "empty" };
  const ids = items.map((i) => i.id);
  const first = await db.from("products").select("id, seller_id, size, category_slug, weight_kg, volume_m3, warehouse_id").in("id", ids);
  // Sin la migración de bodegas: todo sale de la bodega principal
  const data = first.error
    ? (await db.from("products").select("id, seller_id, size, category_slug, weight_kg, volume_m3").in("id", ids)).data
    : first.data;
  const rows = (data ?? []) as ProductLoadRow[];
  if (!rows.length) return { ok: false, reason: "empty" };
  const warehouses = rows.some((r) => !r.seller_id) ? await getWarehouses(db, true) : [];
  const mainId = warehouses[0]?.id ?? null;
  const known = new Set(warehouses.map((w) => w.id));

  // Una entrega por bodega (cada bodega de MUVEO y cada vendedor). En cada una se cobra el producto más caro de llevar.
  const loads = new Map<string, Load>();
  const perItem = new Map<string, Load[]>();
  const scopeOf = new Map<string, { sellerId: string | null; warehouseId: string | null }>();
  for (const it of items) {
    const p = rows.find((r) => r.id === it.id);
    if (!p) continue;
    const l = orderLoad(p, it.qty);
    const wh = p.warehouse_id && known.has(p.warehouse_id) ? p.warehouse_id : mainId;
    const k = p.seller_id ? `s:${p.seller_id}` : `w:${wh ?? ""}`;
    scopeOf.set(k, { sellerId: p.seller_id ?? null, warehouseId: p.seller_id ? null : wh });
    const a = loads.get(k) ?? { kg: 0, m3: 0, rank: 0, serviceMin: 0 };
    loads.set(k, { kg: a.kg + l.kg, m3: a.m3 + l.m3, rank: Math.max(a.rank, l.rank), serviceMin: a.serviceMin + l.serviceMin });
    perItem.set(k, [...(perItem.get(k) ?? []), l]);
  }

  const pricing = await getPricing(db);
  const groups: { sellerId: string | null; price: number }[] = [];
  for (const [k, load] of loads) {
    const { sellerId, warehouseId } = scopeOf.get(k)!;
    const q = await quoteLoad({ load, items: perItem.get(k), address, comuna, sellerId, warehouseId, pricing, db });
    if (!q.ok) return { ok: false, reason: q.reason };
    groups.push({ sellerId, price: q.price });
  }
  // place_cart recibe un precio por vendedor: las bodegas de MUVEO se suman en "muveo"
  const byGroup: Record<string, number> = {};
  for (const g of groups) byGroup[g.sellerId ?? "muveo"] = (byGroup[g.sellerId ?? "muveo"] ?? 0) + g.price;
  return { ok: true, total: groups.reduce((a, g) => a + g.price, 0), groups, byGroup };
}
