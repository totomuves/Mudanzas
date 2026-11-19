/**
 * PRECIO DE DESPACHO · cálculo puro (sirve en servidor y navegador)
 *
 * Costo de un viaje = km (ida y vuelta) × bencina y desgaste por km
 *                   + peajes del viaje
 *                   + horas (manejo ida y vuelta + carga y descarga) × chofer y ayudantes por hora
 * Si la carga no cabe en un viaje, se cuentan los viajes necesarios.
 * Se elige el vehículo más barato que pueda llevar la carga.
 * Como los despachos comparten ruta, cada pedido puede pagar solo una parte
 * del viaje (trip_share_pct; 100 = el viaje completo).
 * Precio = esa parte del costo + % de ganancia, nunca menos que el precio mínimo,
 * redondeado hacia arriba (ej: a $500).
 *
 * PEAJES: los fijos de cada vehículo (toll_per_trip) + los km que la ruta va por
 * autopistas con peaje (TAG) × valor por km (los camiones pagan más, categoría 2).
 *
 * RECARGOS POR PRODUCTO (se suman aparte, sin ganancia ni reparto del viaje):
 *  - Frágil: un monto fijo por unidad (embalaje y carga con cuidado).
 *  - Lujo u obra de arte: un monto fijo de manejo + un % del valor del producto
 *    (cubre el riesgo, como un seguro). Reemplaza al de frágil.
 * El costo extra por km no se usa para el lujo: el riesgo depende del valor,
 * no de la distancia; la distancia ya se cobra en el viaje.
 */

import { SIZES, VEHICLE_KINDS, hasAccessories, type Vehicle, type VehicleKind } from "./delivery";

export type PricingMode = "fijo" | "automatico";

export type PricingSettings = {
  pricing_mode: PricingMode;
  margin_pct: number;
  min_price: number;
  /** Distancia máxima desde la bodega (solo ida) */
  max_km: number;
  round_to: number;
  /** Parte del viaje que paga cada pedido (10 a 100) */
  trip_share_pct: number;
  /** Recargo fijo por producto frágil (CLP por unidad) */
  fragile_fee: number;
  /** Recargo fijo de manejo por producto de lujo u obra de arte (CLP por unidad) */
  luxury_fee: number;
  /** % del valor del producto de lujo u obra de arte */
  luxury_pct: number;
  /** Peaje por km de autopista con TAG, auto o camioneta (CLP) */
  toll_per_km: number;
  /** Cuántas veces paga un camión el peaje de un auto */
  truck_toll_factor: number;
};

export const DEFAULT_PRICING: PricingSettings = {
  pricing_mode: "fijo",
  margin_pct: 30,
  min_price: 3990,
  max_km: 60,
  round_to: 500,
  trip_share_pct: 50,
  fragile_fee: 3000,
  luxury_fee: 10000,
  luxury_pct: 2,
  toll_per_km: 120,
  truck_toll_factor: 2,
};

export const PRICING_COLUMNS_BASE = "pricing_mode, margin_pct, min_price, max_km, round_to, trip_share_pct";
export const PRICING_COLUMNS = `${PRICING_COLUMNS_BASE}, fragile_fee, luxury_fee, luxury_pct, toll_per_km, truck_toll_factor`;

export function readPricing(row: Partial<Record<keyof PricingSettings, unknown>> | null | undefined): PricingSettings {
  const num = (v: unknown, d: number) => (v != null && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    pricing_mode: row?.pricing_mode === "automatico" ? "automatico" : "fijo",
    margin_pct: num(row?.margin_pct, DEFAULT_PRICING.margin_pct),
    min_price: num(row?.min_price, DEFAULT_PRICING.min_price),
    max_km: num(row?.max_km, DEFAULT_PRICING.max_km),
    round_to: Math.max(1, num(row?.round_to, DEFAULT_PRICING.round_to)),
    trip_share_pct: Math.min(100, Math.max(10, num(row?.trip_share_pct, DEFAULT_PRICING.trip_share_pct))),
    fragile_fee: Math.max(0, num(row?.fragile_fee, DEFAULT_PRICING.fragile_fee)),
    luxury_fee: Math.max(0, num(row?.luxury_fee, DEFAULT_PRICING.luxury_fee)),
    luxury_pct: Math.min(50, Math.max(0, num(row?.luxury_pct, DEFAULT_PRICING.luxury_pct))),
    toll_per_km: Math.max(0, num(row?.toll_per_km, DEFAULT_PRICING.toll_per_km)),
    truck_toll_factor: Math.min(5, Math.max(1, num(row?.truck_toll_factor, DEFAULT_PRICING.truck_toll_factor))),
  };
}

/** needs: accesorios que pide la carga (porta bicicleta, parrilla…) */
export type Load = { kg: number; m3: number; rank: number; serviceMin: number; needs?: string[] };

/** Unir dos cargas (misma entrega). */
export function addLoads(a: Load, b: Load): Load {
  const needs = [...(a.needs ?? [])];
  for (const n of b.needs ?? []) if (!needs.some((x) => x.toLowerCase() === n.toLowerCase())) needs.push(n);
  return { kg: a.kg + b.kg, m3: a.m3 + b.m3, rank: Math.max(a.rank, b.rank), serviceMin: a.serviceMin + b.serviceMin, needs };
}

export type HandlingInput = { fragile?: boolean | null; high_value?: boolean | null; price?: number | null; quantity?: number };
export type Handling = { fragile: number; luxury: number; total: number };

/** Recargo por manejo especial de un producto (frágil o lujo/arte). */
export function handlingFee(p: HandlingInput, s: Pick<PricingSettings, "fragile_fee" | "luxury_fee" | "luxury_pct" | "round_to">): Handling {
  const q = Math.max(1, p.quantity ?? 1);
  if (p.high_value) {
    const raw = (s.luxury_fee + (Math.max(0, Number(p.price) || 0) * s.luxury_pct) / 100) * q;
    const luxury = Math.ceil(raw / s.round_to - 1e-9) * s.round_to;
    return { fragile: 0, luxury, total: luxury };
  }
  if (p.fragile) {
    const fragile = s.fragile_fee * q;
    return { fragile, luxury: 0, total: fragile };
  }
  return { fragile: 0, luxury: 0, total: 0 };
}

/** Multiplicador de peaje según el tipo de vehículo (los camiones son categoría 2). */
export function tollFactor(kind: VehicleKind, s: Pick<PricingSettings, "truck_toll_factor">) {
  return kind === "camion" ? s.truck_toll_factor : 1;
}

/** Vehículos de referencia cuando todavía no se registra ninguno. */
export function presetFleet(): Vehicle[] {
  return (Object.keys(VEHICLE_KINDS) as VehicleKind[]).map((k) => {
    const p = VEHICLE_KINDS[k];
    return {
      id: `preset-${k}`, name: p.label, plate: null, kind: k, capacity_kg: p.kg, capacity_m3: p.m3,
      max_item_size: p.maxSize, cost_per_km: p.costPerKm, toll_per_trip: 0, hourly_cost: p.hourlyCost,
      crew: p.crew, driver_id: null, active: true, accessories: [],
    };
  });
}

/** Gasto por hora del vehículo; si no se ingresó, el de referencia de su tipo. */
export function hourlyCostOf(v: Pick<Vehicle, "hourly_cost" | "kind">) {
  return v.hourly_cost != null && Number(v.hourly_cost) > 0 ? Number(v.hourly_cost) : (VEHICLE_KINDS[v.kind]?.hourlyCost ?? 0);
}

export type TripCost = {
  vehicle: Vehicle;
  trips: number;
  km: number;          // ida y vuelta, todos los viajes
  hours: number;       // todos los viajes
  fuel: number;
  /** Todos los peajes (fijos del vehículo + autopistas de la ruta) */
  tolls: number;
  /** Parte de los peajes que viene de las autopistas de la ruta */
  routeTolls: number;
  crew: number;
  cost: number;
};

/** Tramo de ida y vuelta. tollKm: km por autopistas con peaje (ida + vuelta). */
export type Leg = { kmOut: number; kmBack: number; minOut: number; minBack: number; tollKm?: number };
type TollRates = Pick<PricingSettings, "toll_per_km" | "truck_toll_factor">;

/**
 * Costo de llevar la carga con un vehículo.
 * kmOneWay / minutesOneWay: de la bodega a la dirección (la vuelta se asume igual si no se da).
 */
export function tripCost(v: Vehicle, load: Load, leg: Leg, serviceMinutes: number, tollRates?: TollRates): TripCost {
  const capKg = Math.max(1, Number(v.capacity_kg));
  const capM3 = Math.max(0.01, Number(v.capacity_m3));
  const trips = Math.max(1, Math.ceil(Math.max(load.kg / capKg, load.m3 / capM3) - 1e-9));
  const km = (leg.kmOut + leg.kmBack) * trips;
  const hours = (((leg.minOut + leg.minBack) + serviceMinutes + load.serviceMin) * trips) / 60;
  const fuel = km * Number(v.cost_per_km || 0);
  const routeTolls = tollRates ? (leg.tollKm ?? 0) * tollRates.toll_per_km * tollFactor(v.kind, tollRates) * trips : 0;
  const tolls = Number(v.toll_per_trip || 0) * trips + routeTolls;
  const crew = hours * hourlyCostOf(v);
  return { vehicle: v, trips, km, hours, fuel, tolls, routeTolls, crew, cost: fuel + tolls + crew };
}

/**
 * Vehículos que pueden llevar la carga: el producto más grande y los accesorios
 * que pide (porta bicicleta, parrilla…). Si ninguno tiene esos accesorios, se
 * usan los que sirven por tamaño y missing dice qué falta. Si ninguno sirve por
 * tamaño, los más grandes que haya.
 */
export function ableVehicles(fleet: Vehicle[], load: Load): { vehicles: Vehicle[]; missing: string[] } {
  const rank = (v: Vehicle) => SIZES[v.max_item_size]?.rank ?? 3;
  let bySize = fleet.filter((v) => rank(v) >= load.rank);
  if (!bySize.length) {
    const top = Math.max(...fleet.map(rank));
    bySize = fleet.filter((v) => rank(v) === top);
  }
  const needs = load.needs ?? [];
  if (!needs.length) return { vehicles: bySize, missing: [] };
  const full = bySize.filter((v) => hasAccessories(v, needs));
  if (full.length) return { vehicles: full, missing: [] };
  const missing = needs.filter((n) => !fleet.some((v) => hasAccessories(v, [n])));
  return { vehicles: bySize, missing: missing.length ? missing : needs };
}

/** El más barato primero; a igual costo, el que lo hace en menos viajes. */
export function rankVehicles(fleet: Vehicle[], load: Load, leg: Leg, serviceMinutes: number, tollRates?: TollRates) {
  const { vehicles, missing } = ableVehicles(fleet, load);
  const options = vehicles
    .map((v) => tripCost(v, load, leg, serviceMinutes, tollRates))
    .sort((a, b) => a.cost - b.cost || a.trips - b.trips);
  return { options, missing };
}

export function priceFromCost(cost: number, s: PricingSettings) {
  const withMargin = ((cost * s.trip_share_pct) / 100) * (1 + s.margin_pct / 100);
  const rounded = Math.ceil(withMargin / s.round_to - 1e-9) * s.round_to;
  return Math.max(s.min_price, rounded);
}
