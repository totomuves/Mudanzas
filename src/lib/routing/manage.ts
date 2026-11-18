import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { SIZE_KEYS, VEHICLE_KEYS, type ItemSize, type VehicleKind } from "@/lib/delivery";
import { geocode } from "./geo";
import { nextDeliveryDateAfter, planDeliveryDay, publishDay, readDeliverySettings, reoptimizeRoute, type SellerScope } from "./planner";

/**
 * Acciones de gestión del reparto, compartidas por el admin de MUVEO (scope null)
 * y el panel de cada vendedor (scope = id del vendedor).
 * Quien llama ya validó el permiso; aquí se valida que cada cosa sea de ese scope.
 */

export type FormState = { ok?: string; error?: string };
export type PlanState = { ok?: string; error?: string; unassigned?: { orderId: string; title: string; reason: string }[] };

const time = (v: FormDataEntryValue | null, fallback: string) => {
  const s = String(v ?? "");
  return /^\d{2}:\d{2}$/.test(s) ? s : fallback;
};
const int = (v: FormDataEntryValue | null, min: number, max: number, fallback: number) => {
  const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const dec = (v: FormDataEntryValue | null) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};
const isId = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function saveSettingsFor(scope: SellerScope, f: FormData): Promise<FormState> {
  const db = createAdminClient();
  const days = f.getAll("days").map((d) => parseInt(String(d), 10)).filter((d) => d >= 1 && d <= 7);
  if (!days.length) return { error: "Elige al menos un día de despacho." };
  const start = time(f.get("start_time"), "09:00");
  const end = time(f.get("end_time"), "19:00");
  const mid = time(f.get("midday_time"), "14:00");
  if (!(start < mid && mid < end)) return { error: "Revisa los horarios: inicio < cambio de franja < término." };

  const address = String(f.get("depot_address") ?? "").trim().slice(0, 200);
  const { settings: current } = await readDeliverySettings(db, scope);
  let lat = current?.depot_lat ?? null, lng = current?.depot_lng ?? null;
  let note = "";
  if (address && address !== current?.depot_address) {
    const p = await geocode(address);
    lat = p.lat;
    lng = p.lng;
    if (p.source === "comuna") note = " No encontré la dirección exacta de la bodega: revisa que tenga número y comuna.";
  }
  if (!address) {
    lat = null;
    lng = null;
  }
  const row = {
    days: [...new Set(days)].sort(),
    cutoff_hour: int(f.get("cutoff_hour"), 0, 23, 18),
    start_time: start,
    end_time: end,
    midday_time: mid,
    service_minutes: int(f.get("service_minutes"), 1, 120, 12),
    window_minutes: int(f.get("window_minutes"), 30, 480, 120),
    depot_address: address || null,
    depot_lat: lat,
    depot_lng: lng,
    balance_routes: f.get("balance_routes") === "on",
  };
  const { error } = scope
    ? await db.from("seller_delivery_settings").upsert({ seller_id: scope, ...row })
    : await db.from("delivery_settings").upsert({ id: 1, ...row });
  if (error) return { error: error.message };
  return { ok: `Guardado.${note}` };
}

export async function saveVehicleFor(scope: SellerScope, f: FormData, allowedDrivers: string[] | null): Promise<FormState> {
  const db = createAdminClient();
  const id = String(f.get("id") ?? "");
  const kind = String(f.get("kind")) as VehicleKind;
  const maxSize = String(f.get("max_item_size")) as ItemSize;
  const name = String(f.get("name") ?? "").trim().slice(0, 60);
  const m3 = dec(f.get("capacity_m3"));
  const kg = int(f.get("capacity_kg"), 1, 50000, 0);
  if (name.length < 2) return { error: "Ponle un nombre (ej: Camión 1)." };
  if (!VEHICLE_KEYS.includes(kind)) return { error: "Elige el tipo de vehículo." };
  if (!SIZE_KEYS.includes(maxSize)) return { error: "Elige el tamaño máximo." };
  if (!(m3 > 0 && m3 <= 100)) return { error: "Revisa la capacidad en m³." };
  if (!kg) return { error: "Revisa la capacidad en kg." };
  const driver = String(f.get("driver_id") ?? "");
  const driverOk = isId(driver) && (allowedDrivers == null || allowedDrivers.includes(driver));
  const row = {
    name,
    plate: String(f.get("plate") ?? "").trim().toUpperCase().slice(0, 12) || null,
    kind,
    capacity_m3: Math.round(m3 * 100) / 100,
    capacity_kg: kg,
    max_item_size: maxSize,
    cost_per_km: int(f.get("cost_per_km"), 0, 10000, 250),
    toll_per_trip: int(f.get("toll_per_trip"), 0, 200000, 0),
    hourly_cost: int(f.get("hourly_cost"), 0, 500000, 0),
    crew: int(f.get("crew"), 1, 4, 1),
    driver_id: driverOk ? driver : null,
    active: f.get("active") === "on",
  };
  // Parking (solo si el formulario lo trae: requiere la migración de bodegas y parking)
  if (f.has("parking_mode")) {
    const mode = String(f.get("parking_mode") ?? "");
    const addr = String(f.get("parking_address") ?? "").trim().slice(0, 200);
    let parking: Record<string, unknown> = { parking_warehouse_id: null, parking_address: null, parking_lat: null, parking_lng: null };
    if (mode === "direccion") {
      if (addr.length < 5) return { error: "Escribe la dirección del parking (calle, número y comuna)." };
      const { data: cur } = isId(id) ? await db.from("vehicles").select("parking_address, parking_lat, parking_lng").eq("id", id).maybeSingle() : { data: null };
      if (cur && cur.parking_address === addr && cur.parking_lat != null) {
        parking = { ...parking, parking_address: addr, parking_lat: cur.parking_lat, parking_lng: cur.parking_lng };
      } else {
        const p = await geocode(addr);
        parking = { ...parking, parking_address: addr, parking_lat: p.lat, parking_lng: p.lng };
      }
    } else if (!scope && isId(mode)) {
      // Una de las bodegas de MUVEO
      parking = { ...parking, parking_warehouse_id: mode };
    }
    Object.assign(row, parking);
  }
  let res;
  if (isId(id)) {
    let q = db.from("vehicles").update(row).eq("id", id);
    q = scope ? q.eq("seller_id", scope) : q.is("seller_id", null);
    res = await q;
  } else {
    res = await db.from("vehicles").insert({ ...row, seller_id: scope });
  }
  if (res.error) return { error: res.error.message };
  return { ok: "Vehículo guardado." };
}

export async function deleteVehicleFor(scope: SellerScope, id: string) {
  if (!isId(id)) return;
  const db = createAdminClient();
  let q = db.from("vehicles").delete().eq("id", id);
  q = scope ? q.eq("seller_id", scope) : q.is("seller_id", null);
  await q;
}

/** La ruta pertenece a este scope. */
async function ownsRoute(scope: SellerScope, routeId: string) {
  if (!isId(routeId)) return false;
  const { data } = await createAdminClient().from("delivery_routes").select("seller_id").eq("id", routeId).maybeSingle();
  return Boolean(data) && (data!.seller_id ?? null) === scope;
}

export async function planFor(scope: SellerScope, f: FormData): Promise<PlanState> {
  const date = String(f.get("date") ?? "");
  if (!isDate(date)) return { error: "Fecha inválida." };
  try {
    const r = await planDeliveryDay(date, scope);
    if (!r.routes && !r.unassigned.length) return { ok: "No hay pedidos ni retiros pendientes para este día." };
    const fuente = r.source === "google" ? "con tráfico real de Google" : "con tráfico estimado";
    return {
      ok: `Listo: ${r.pickups ? `${r.stops - r.pickups} entregas y ${r.pickups} retiros` : `${r.stops} entregas`} en ${r.routes} ${r.routes === 1 ? "ruta" : "rutas"}, ${r.distanceKm} km en total (${fuente}; ${r.iterations.toLocaleString("es-CL")} combinaciones probadas en ${(r.ms / 1000).toFixed(1)} s).`,
      unassigned: r.unassigned,
    };
  } catch (e) {
    console.error("[rutas] planificar", e);
    return { error: e instanceof Error ? e.message : "No se pudo planificar." };
  }
}

export async function publishFor(scope: SellerScope, f: FormData) {
  const date = String(f.get("date") ?? "");
  if (isDate(date)) await publishDay(date, scope);
}

export async function assignDriverFor(scope: SellerScope, f: FormData, allowedDrivers: string[] | null) {
  const id = String(f.get("routeId") ?? "");
  const driver = String(f.get("driver_id") ?? "");
  if (!(await ownsRoute(scope, id))) return;
  const ok = isId(driver) && (allowedDrivers == null || allowedDrivers.includes(driver));
  await createAdminClient().from("delivery_routes").update({ driver_id: ok ? driver : null }).eq("id", id);
}

/**
 * Elimina una ruta que todavía no sale (borrador o publicada).
 * Los pedidos y retiros no se borran: quedan "sin ruta" en el mismo día para volver a planificar.
 * Las rutas en curso o terminadas no se borran, porque guardan firmas y fotos.
 */
export async function deleteRouteFor(scope: SellerScope, f: FormData) {
  const id = String(f.get("routeId") ?? "");
  if (!(await ownsRoute(scope, id))) return;
  const db = createAdminClient();
  const { data: route } = await db.from("delivery_routes").select("status").eq("id", id).maybeSingle();
  if (!route || (route.status !== "borrador" && route.status !== "publicada")) return;
  await db.from("route_stops").delete().eq("route_id", id);
  await db.from("delivery_routes").delete().eq("id", id);
}

export async function reoptimizeFor(scope: SellerScope, f: FormData) {
  const id = String(f.get("routeId") ?? "");
  if (await ownsRoute(scope, id)) await reoptimizeRoute(id, null);
}

/** Mueve un pedido a otra fecha de despacho (o a la siguiente disponible). */
export async function moveOrderFor(scope: SellerScope, f: FormData) {
  const orderId = String(f.get("orderId") ?? "");
  const from = String(f.get("from") ?? "");
  let to = String(f.get("to") ?? "");
  if (!isId(orderId)) return;
  const db = createAdminClient();
  const { data: order } = await db.from("orders").select("seller_id").eq("id", orderId).maybeSingle();
  if (!order || (order.seller_id ?? null) !== scope) return;
  if (!isDate(to)) to = (isDate(from) ? await nextDeliveryDateAfter(from, scope) : null) ?? "";
  if (!isDate(to)) return;
  await db.from("route_stops").delete().eq("order_id", orderId).neq("status", "entregado");
  await db.from("orders").update({ delivery_date: to }).eq("id", orderId).is("delivered_at", null);
}
