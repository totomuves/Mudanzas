import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { SIZES, type DeliverySettings, type Vehicle, type Warehouse } from "@/lib/delivery";
import { hourlyCostOf } from "@/lib/shipping-pricing";
import { geocode, type Point } from "./geo";
import { haversine } from "./optimizer";

/**
 * BODEGAS Y PARKING
 * MUVEO guarda sus productos en varias bodegas (tabla warehouses). Cada vehículo
 * duerme en su parking: una de las bodegas o una dirección propia.
 * Los vendedores tienen una sola bodega (la de sus ajustes de reparto).
 */

type Db = ReturnType<typeof createAdminClient>;

/** Un lugar fijo de la logística: bodega o parking. `key` identifica el punto (mismo key = mismo lugar). */
export type Site = Point & { key: string; name: string; warehouseId: string | null };

/** Bodegas de MUVEO. migrated = false si aún no se corre la migración de bodegas. */
export async function readWarehouses(db: Db = createAdminClient(), onlyActive = false) {
  let q = db.from("warehouses").select("*").order("is_default", { ascending: false }).order("created_at");
  if (onlyActive) q = q.eq("active", true);
  const { data, error } = await q;
  return { warehouses: (error ? [] : (data ?? [])) as Warehouse[], migrated: !error };
}

export async function getWarehouses(db: Db = createAdminClient(), onlyActive = false): Promise<Warehouse[]> {
  return (await readWarehouses(db, onlyActive)).warehouses;
}

function fullAddress(address: string, comuna: string | null) {
  return comuna && !address.toLowerCase().includes(comuna.toLowerCase()) ? `${address}, ${comuna}` : address;
}

/** Ubica una bodega en el mapa si aún no tiene coordenadas (y las guarda). */
async function locateWarehouse(db: Db, w: Warehouse): Promise<Point | null> {
  if (w.lat != null && w.lng != null) return { lat: w.lat, lng: w.lng };
  if (!w.address) return null;
  const p = await geocode(fullAddress(w.address, w.comuna), w.comuna);
  await db.from("warehouses").update({ lat: p.lat, lng: p.lng }).eq("id", w.id);
  w.lat = p.lat;
  w.lng = p.lng;
  return p;
}

export type Logistics = {
  /** Bodegas con ubicación (la principal primero). */
  bodegas: Site[];
  main: Site;
  /** Bodega de un producto (null o desconocida = la principal). */
  bodegaOf: (warehouseId: string | null | undefined) => Site;
  /** Parking del vehículo (si no tiene, la bodega principal). */
  parkingOf: (v: Vehicle) => Site;
  /** true si hay bodegas registradas (si no, se usa la dirección de los ajustes). */
  usingWarehouses: boolean;
  /** true si ya se corrió la migración de bodegas y parking. */
  migrated: boolean;
};

/**
 * Bodegas y parkings de un scope (null = MUVEO, id = vendedor).
 * `depot`: la bodega de los ajustes de reparto (respaldo si no hay bodegas registradas).
 */
export async function loadLogistics(db: Db, sellerId: string | null, depot: Point, settings?: DeliverySettings | null, vehicles: Vehicle[] = []): Promise<Logistics> {
  // La migración también agrega el parking a los vehículos (de MUVEO y de los vendedores)
  const { warehouses, migrated } = await readWarehouses(db, true);
  const list = sellerId ? [] : warehouses;
  const bodegas: Site[] = [];
  for (const w of list) {
    const p = await locateWarehouse(db, w);
    if (p) bodegas.push({ ...p, key: `w:${w.id}`, name: w.name, warehouseId: w.id });
  }
  const usingWarehouses = bodegas.length > 0;
  const fallback: Site = { ...depot, key: "depot", name: settings?.depot_address ? "Bodega" : "Bodega (sin dirección)", warehouseId: null };
  const main = bodegas[0] ?? fallback;
  const byId = new Map(bodegas.map((b) => [b.warehouseId!, b]));

  // Parkings con dirección propia que aún no están en el mapa
  for (const v of vehicles) {
    if (v.parking_warehouse_id || !v.parking_address || (v.parking_lat != null && v.parking_lng != null)) continue;
    const p = await geocode(v.parking_address);
    v.parking_lat = p.lat;
    v.parking_lng = p.lng;
    await db.from("vehicles").update({ parking_lat: p.lat, parking_lng: p.lng }).eq("id", v.id);
  }

  return {
    bodegas: usingWarehouses ? bodegas : [fallback],
    main,
    usingWarehouses,
    migrated,
    bodegaOf: (id) => (id && byId.get(id)) || main,
    parkingOf: (v) => {
      if (v.parking_warehouse_id && byId.has(v.parking_warehouse_id)) return byId.get(v.parking_warehouse_id)!;
      if (v.parking_lat != null && v.parking_lng != null) {
        return { lat: v.parking_lat, lng: v.parking_lng, key: `p:${v.id}`, name: `Parking ${v.name}`, warehouseId: null };
      }
      return main;
    },
  };
}

/** Puntos únicos (por key) para armar la matriz de viaje. */
export class NodeIndex {
  points: Point[] = [];
  private keys = new Map<string, number>();
  add(key: string, p: Point) {
    const hit = this.keys.get(key);
    if (hit != null) return hit;
    this.points.push({ lat: p.lat, lng: p.lng });
    this.keys.set(key, this.points.length - 1);
    return this.points.length - 1;
  }
}

/** Dónde deja los retiros un vehículo: en su parking si es bodega; si no, en la bodega más cercana a su parking. */
export function dropSiteFor(lg: Logistics, v: Vehicle): Site {
  const park = lg.parkingOf(v);
  if (lg.bodegas.some((b) => b.key === park.key)) return park;
  return [...lg.bodegas].sort((a, b) => haversine(park, a) - haversine(park, b))[0] ?? lg.main;
}

export type VehicleSuggestion = { vehicle: Vehicle; km: number; cost: number; fits: boolean };

/**
 * Sugiere qué vehículo usar para un grupo de paradas: que le quepa todo y el
 * producto más grande, con el parking más cerca y el gasto más bajo.
 * Estimación rápida (línea recta × 1,32 a 30 km/h); el plan exacto lo hace el optimizador.
 * `via`: bodega por la que tiene que pasar (cargar o descargar), si hay.
 */
export function suggestVehicle(
  fleet: Vehicle[],
  jobs: { lat: number; lng: number; kg: number; m3: number; rank: number }[],
  lg: Logistics,
  via?: Point | null,
): VehicleSuggestion[] {
  if (!fleet.length) return [];
  const kg = jobs.reduce((a, j) => a + j.kg, 0);
  const m3 = jobs.reduce((a, j) => a + j.m3, 0);
  const rank = jobs.reduce((a, j) => Math.max(a, j.rank), 0);
  const c = jobs.length
    ? { lat: jobs.reduce((a, j) => a + j.lat, 0) / jobs.length, lng: jobs.reduce((a, j) => a + j.lng, 0) / jobs.length }
    : null;
  const spread = c ? jobs.reduce((a, j) => a + haversine(c, j), 0) * 1.5 : 0;
  return fleet
    .map((v) => {
      const park = lg.parkingOf(v);
      const drop = via ?? dropSiteFor(lg, v);
      const m = c ? haversine(park, drop) + haversine(drop, c) + spread + haversine(c, park) : 0;
      const km = (m * 1.32) / 1000;
      const hours = km / 30 + (jobs.length * 15) / 60;
      const fits = (SIZES[v.max_item_size]?.rank ?? 3) >= rank && Number(v.capacity_kg) >= kg && Number(v.capacity_m3) >= m3;
      return { vehicle: v, km, cost: km * Number(v.cost_per_km || 0) + hours * hourlyCostOf(v) + Number(v.toll_per_trip || 0), fits };
    })
    .sort((a, b) => Number(b.fits) - Number(a.fits) || a.cost - b.cost);
}
