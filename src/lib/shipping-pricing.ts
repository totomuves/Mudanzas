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
 */

import { SIZES, VEHICLE_KINDS, type Vehicle, type VehicleKind } from "./delivery";

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
};

export const DEFAULT_PRICING: PricingSettings = {
  pricing_mode: "fijo",
  margin_pct: 30,
  min_price: 3990,
  max_km: 60,
  round_to: 500,
  trip_share_pct: 50,
};

export function readPricing(row: Partial<Record<keyof PricingSettings, unknown>> | null | undefined): PricingSettings {
  const num = (v: unknown, d: number) => (v != null && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    pricing_mode: row?.pricing_mode === "automatico" ? "automatico" : "fijo",
    margin_pct: num(row?.margin_pct, DEFAULT_PRICING.margin_pct),
    min_price: num(row?.min_price, DEFAULT_PRICING.min_price),
    max_km: num(row?.max_km, DEFAULT_PRICING.max_km),
    round_to: Math.max(1, num(row?.round_to, DEFAULT_PRICING.round_to)),
    trip_share_pct: Math.min(100, Math.max(10, num(row?.trip_share_pct, DEFAULT_PRICING.trip_share_pct))),
  };
}

export type Load = { kg: number; m3: number; rank: number; serviceMin: number };

/** Vehículos de referencia cuando todavía no se registra ninguno. */
export function presetFleet(): Vehicle[] {
  return (Object.keys(VEHICLE_KINDS) as VehicleKind[]).map((k) => {
    const p = VEHICLE_KINDS[k];
    return {
      id: `preset-${k}`, name: p.label, plate: null, kind: k, capacity_kg: p.kg, capacity_m3: p.m3,
      max_item_size: p.maxSize, cost_per_km: p.costPerKm, toll_per_trip: 0, hourly_cost: p.hourlyCost,
      crew: p.crew, driver_id: null, active: true,
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
  tolls: number;
  crew: number;
  cost: number;
};

/**
 * Tramos de un despacho. Out/Back: bodega → dirección → bodega.
 * ToStart/Home: del parking del vehículo a la bodega, y de la dirección de vuelta
 * al parking (si el parking es la bodega, ToStart = 0 y Home = Back).
 */
export type Leg = {
  kmOut: number; kmBack: number; minOut: number; minBack: number;
  kmToStart?: number; minToStart?: number; kmHome?: number; minHome?: number;
  /** Minutos de carga en la bodega */
  loadMin?: number;
};

/**
 * Costo de llevar la carga con un vehículo: parking → bodega → dirección → parking.
 * Si no cabe en un viaje, cada viaje extra es dirección → bodega → dirección.
 */
export function tripCost(
  v: Vehicle,
  load: Load,
  leg: Leg,
  serviceMinutes: number,
): TripCost {
  const capKg = Math.max(1, Number(v.capacity_kg));
  const capM3 = Math.max(0.01, Number(v.capacity_m3));
  const trips = Math.max(1, Math.ceil(Math.max(load.kg / capKg, load.m3 / capM3) - 1e-9));
  const toStart = leg.kmToStart ?? 0, home = leg.kmHome ?? leg.kmBack;
  const minToStart = leg.minToStart ?? 0, minHome = leg.minHome ?? leg.minBack;
  const km = toStart + leg.kmOut + (trips - 1) * (leg.kmBack + leg.kmOut) + home;
  const drive = minToStart + leg.minOut + (trips - 1) * (leg.minBack + leg.minOut) + minHome;
  const hours = (drive + (serviceMinutes + load.serviceMin + (leg.loadMin ?? 0)) * trips) / 60;
  const fuel = km * Number(v.cost_per_km || 0);
  const tolls = Number(v.toll_per_trip || 0) * trips;
  const crew = hours * hourlyCostOf(v);
  return { vehicle: v, trips, km, hours, fuel, tolls, crew, cost: fuel + tolls + crew };
}

/** Vehículos que pueden llevar el producto más grande de la carga (o los más grandes que haya). */
export function ableVehicles(fleet: Vehicle[], load: Load) {
  const rank = (v: Vehicle) => SIZES[v.max_item_size]?.rank ?? 3;
  const able = fleet.filter((v) => rank(v) >= load.rank);
  if (able.length) return able;
  const top = Math.max(...fleet.map(rank));
  return fleet.filter((v) => rank(v) === top);
}

/**
 * El más barato primero; a igual costo, el que lo hace en menos viajes.
 * `leg` puede depender del vehículo (cada uno sale de su parking).
 */
export function rankVehicles(fleet: Vehicle[], load: Load, leg: Leg | ((v: Vehicle) => Leg), serviceMinutes: number) {
  return ableVehicles(fleet, load)
    .map((v) => tripCost(v, load, typeof leg === "function" ? leg(v) : leg, serviceMinutes))
    .sort((a, b) => a.cost - b.cost || a.trips - b.trips);
}

export function priceFromCost(cost: number, s: PricingSettings) {
  const withMargin = ((cost * s.trip_share_pct) / 100) * (1 + s.margin_pct / 100);
  const rounded = Math.ceil(withMargin / s.round_to - 1e-9) * s.round_to;
  return Math.max(s.min_price, rounded);
}
