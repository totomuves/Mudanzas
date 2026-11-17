import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_DELIVERY_SETTINGS, ROUTE_COLORS, SIZES, formatDeliveryDate, formatTime, orderLoad, santiagoParts, santiagoToDate,
  slotWindow, toSeconds, upcomingDeliveryDates, type DeliverySettings, type DeliverySlot, type Vehicle,
} from "@/lib/delivery";
import { optimizeRoutes, type OptStop, type OptVehicle } from "./optimizer";
import { SANTIAGO_CENTER, geocode, travelMatrix, type Point } from "./geo";
import { notifyOrder } from "./notify";

type Db = ReturnType<typeof createAdminClient>;

/** null = MUVEO; id = el reparto propio de ese vendedor. */
export type SellerScope = string | null;

/** Ajustes de reparto de MUVEO o de un vendedor (null si aún no existen). */
export async function readDeliverySettings(db: Db, sellerId: SellerScope = null) {
  const { data, error } = sellerId
    ? await db.from("seller_delivery_settings").select("*").eq("seller_id", sellerId).maybeSingle()
    : await db.from("delivery_settings").select("*").eq("id", 1).maybeSingle();
  if (error) return { settings: null, error };
  return { settings: data ? ({ ...DEFAULT_DELIVERY_SETTINGS, ...(data as Partial<DeliverySettings>) } as DeliverySettings) : null, error: null };
}

export async function getDeliverySettings(db: Db = createAdminClient(), sellerId: SellerScope = null): Promise<DeliverySettings> {
  return (await readDeliverySettings(db, sellerId)).settings ?? DEFAULT_DELIVERY_SETTINGS;
}

export async function getVehicles(db: Db = createAdminClient(), onlyActive = true, sellerId: SellerScope = null): Promise<Vehicle[]> {
  let q = db.from("vehicles").select("*").order("created_at");
  q = sellerId ? q.eq("seller_id", sellerId) : q.is("seller_id", null);
  if (onlyActive) q = q.eq("active", true);
  const { data } = await q;
  return (data ?? []) as Vehicle[];
}

/** Bodega de salida (si no tiene coordenadas, se buscan con la dirección y se guardan). */
export async function depotPoint(db: Db, s: DeliverySettings, sellerId: SellerScope = null): Promise<Point> {
  if (s.depot_lat != null && s.depot_lng != null) return { lat: s.depot_lat, lng: s.depot_lng };
  if (s.depot_address) {
    const p = await geocode(s.depot_address);
    if (p.source !== "comuna") {
      if (sellerId) await db.from("seller_delivery_settings").update({ depot_lat: p.lat, depot_lng: p.lng }).eq("seller_id", sellerId);
      else await db.from("delivery_settings").update({ depot_lat: p.lat, depot_lng: p.lng }).eq("id", 1);
      return p;
    }
  }
  return SANTIAGO_CENTER;
}

type PlanOrder = {
  id: string;
  user_id: string | null;
  product_id: string;
  quantity: number;
  address: string | null;
  comuna: string | null;
  delivery_slot: DeliverySlot | null;
  lat: number | null;
  lng: number | null;
  buyer_name: string;
  checkout_id?: string | null;
  products: { title: string; size: string | null; category_slug: string; weight_kg: number | null; volume_m3: number | null } | null;
  /** Retiro (lo que regalan los clientes) en vez de pedido. */
  pickup?: boolean;
};

const PICKUP_PLAN_FIELDS = "id, address, comuna, slot, lat, lng, contact_name, items, size, weight_kg, volume_m3";
type PickupPlanRow = {
  id: string; address: string; comuna: string | null; slot: string; lat: number | null; lng: number | null;
  contact_name: string; items: string; size: string | null; weight_kg: number | null; volume_m3: number | null;
};
/** Un retiro con la forma de un pedido para el planificador. */
function pickupJob(p: PickupPlanRow): PlanOrder {
  return {
    id: p.id, user_id: null, product_id: "", quantity: 1,
    address: p.comuna && !p.address.includes(p.comuna) ? `${p.address}, ${p.comuna}` : p.address,
    comuna: p.comuna, delivery_slot: (p.slot as DeliverySlot) ?? "cualquiera", lat: p.lat, lng: p.lng,
    buyer_name: p.contact_name, checkout_id: null,
    products: { title: p.items, size: p.size, category_slug: "", weight_kg: p.weight_kg, volume_m3: p.volume_m3 },
    pickup: true,
  };
}

/** Retiros pendientes de un día (solo MUVEO). [] si aún no existe la tabla. */
async function pickupsOfDay(db: Db, date: string, exclude: Set<string>) {
  const { data, error } = await db.from("pickups").select(PICKUP_PLAN_FIELDS).eq("pickup_date", date).in("status", ["pendiente", "fallido"]);
  if (error) return [];
  return ((data ?? []) as PickupPlanRow[]).filter((p) => !exclude.has(p.id)).map(pickupJob);
}

const ORDER_FIELDS = "id, user_id, product_id, quantity, address, comuna, delivery_slot, lat, lng, buyer_name, checkout_id, products(title, size, category_slug, weight_kg, volume_m3)";

/**
 * Junta los pedidos de una misma compra del carrito: van a la misma dirección,
 * así que son UNA sola parada (una visita, una ventana, una firma).
 */
function groupByCheckout<T extends { id: string; checkout_id?: string | null }>(orders: T[]) {
  const groups = new Map<string, T[]>();
  for (const o of orders) {
    const k = o.checkout_id && !(o as { pickup?: boolean }).pickup ? `c:${o.checkout_id}` : o.id;
    const g = groups.get(k);
    if (g) g.push(o);
    else groups.set(k, [o]);
  }
  return [...groups.values()];
}

/** Carga y tiempo de entrega de una parada con uno o varios pedidos. */
function stopLoad(orders: { quantity: number; products: Parameters<typeof orderLoad>[0] | null }[]) {
  return orders.reduce(
    (a, o) => {
      const l = orderLoad(o.products ?? {}, o.quantity);
      return { kg: a.kg + l.kg, m3: a.m3 + l.m3, rank: Math.max(a.rank, l.rank), serviceMin: a.serviceMin + l.serviceMin };
    },
    { kg: 0, m3: 0, rank: 0, serviceMin: 0 },
  );
}

/** Ubica en el mapa los pedidos que aún no tienen coordenadas. */
async function locateOrders(db: Db, orders: PlanOrder[]) {
  for (const o of orders) {
    if (o.lat != null && o.lng != null) continue;
    const p = await geocode((o.address ?? "").trim() || (o.comuna ?? ""), o.comuna);
    o.lat = p.lat;
    o.lng = p.lng;
    await db.from(o.pickup ? "pickups" : "orders").update({ lat: p.lat, lng: p.lng, geo_source: p.source }).eq("id", o.id);
  }
}

/** Ventana que se le promete al comprador: alrededor de la hora estimada, dentro de su franja. */
function promisedWindow(etaSec: number, s: DeliverySettings, tw: [number, number]) {
  const W = s.window_minutes * 60;
  const q = 15 * 60;
  let start = Math.floor((etaSec - W * 0.35) / q) * q;
  start = Math.max(start, tw[0], toSeconds(s.start_time));
  let end = start + W;
  if (end > tw[1] && etaSec + q <= tw[1]) {
    end = Math.max(tw[1], Math.ceil((etaSec + q) / q) * q);
    start = Math.max(tw[0], end - W);
  }
  return [start, end] as const;
}

export type PlanSummary = {
  date: string;
  routes: number;
  stops: number;
  /** Cuántas de las paradas son retiros. */
  pickups: number;
  unassigned: { orderId: string; title: string; reason: string }[];
  source: "google" | "estimado";
  distanceKm: number;
  iterations: number;
  ms: number;
};

/**
 * Planifica (o vuelve a planificar) las rutas de un día de despacho.
 * Las rutas que ya salieron (en curso o terminadas) no se tocan.
 */
export async function planDeliveryDay(date: string, sellerId: SellerScope = null): Promise<PlanSummary> {
  const db = createAdminClient();
  const [settings, vehicles] = await Promise.all([getDeliverySettings(db, sellerId), getVehicles(db, true, sellerId)]);

  let routesQ = db.from("delivery_routes").select("id, status, vehicle_id, route_stops(*)").eq("delivery_date", date);
  routesQ = sellerId ? routesQ.eq("seller_id", sellerId) : routesQ.is("seller_id", null);
  const { data: existing } = await routesQ;
  const locked = (existing ?? []).filter((r) => r.status === "en_curso" || r.status === "terminada");
  const lockedStops = locked.flatMap((r) => r.route_stops as { order_id: string | null; pickup_id?: string | null }[]);
  const lockedOrders = new Set(lockedStops.map((s) => s.order_id).filter(Boolean) as string[]);
  const lockedPickups = new Set(lockedStops.map((s) => s.pickup_id).filter(Boolean) as string[]);
  const busyVehicles = new Set(locked.map((r) => r.vehicle_id).filter(Boolean));
  const replace = (existing ?? []).filter((r) => r.status === "borrador" || r.status === "publicada").map((r) => r.id);

  // Pedidos pagados sin fecha que ya podrían salir: se suman a este día
  let backlogQ = db
    .from("orders")
    .update({ delivery_date: date })
    .eq("status", "paid")
    .eq("delivery", "despacho")
    .is("delivery_date", null)
    .is("delivered_at", null)
    .lt("paid_at", santiagoToDate(date, 0).toISOString());
  backlogQ = sellerId ? backlogQ.eq("seller_id", sellerId) : backlogQ.is("seller_id", null);
  await backlogQ;

  let ordersQ = db
    .from("orders")
    .select(ORDER_FIELDS)
    .eq("status", "paid")
    .eq("delivery", "despacho")
    .eq("delivery_date", date)
    .is("delivered_at", null);
  ordersQ = sellerId ? ordersQ.eq("seller_id", sellerId) : ordersQ.is("seller_id", null);
  const { data: rows } = await ordersQ;
  const deliveries = ((rows ?? []) as unknown as PlanOrder[]).filter((o) => !lockedOrders.has(o.id));
  // Los retiros (lo que regalan los clientes) van en las rutas de MUVEO, mezclados si conviene
  const pickups = sellerId ? [] : await pickupsOfDay(db, date, lockedPickups);
  const orders = [...deliveries, ...pickups];

  // Las paradas viejas (de otro día o de un intento fallido) se reemplazan
  if (deliveries.length) await db.from("route_stops").delete().in("order_id", deliveries.map((o) => o.id));
  if (pickups.length) await db.from("route_stops").delete().in("pickup_id", pickups.map((o) => o.id));
  if (replace.length) await db.from("delivery_routes").delete().in("id", replace);

  const fleet = vehicles.filter((v) => !busyVehicles.has(v.id));
  const empty: PlanSummary = { date, routes: 0, stops: 0, pickups: 0, unassigned: [], source: "estimado", distanceKm: 0, iterations: 0, ms: 0 };
  if (!orders.length) return empty;
  if (!fleet.length) {
    return { ...empty, unassigned: orders.map((o) => ({ orderId: o.id, title: o.products?.title ?? "Pedido", reason: "No hay vehículos disponibles" })) };
  }

  return optimizeAndSave(db, {
    date, sellerId, settings, fleet, orders,
    fixedCost: (v) => (settings.balance_routes ? 0 : 6000 + v.cost_per_km * 10),
    balance: settings.balance_routes,
    status: "borrador",
    driverFor: (v) => v.driver_id,
    pickupsOnly: false,
  });
}

/**
 * Ruta de retiros que arma el propio chofer: toma los retiros del día que
 * aún no van en otra ruta y los ordena para su vehículo. Queda lista para salir.
 */
export async function planPickupRoute(date: string, driverId: string, vehicleId?: string | null): Promise<PlanSummary & { routeId?: string }> {
  const db = createAdminClient();
  const [settings, vehicles] = await Promise.all([getDeliverySettings(db, null), getVehicles(db, true, null)]);
  const empty: PlanSummary = { date, routes: 0, stops: 0, pickups: 0, unassigned: [], source: "estimado", distanceKm: 0, iterations: 0, ms: 0 };

  const { data: existing } = await db
    .from("delivery_routes")
    .select("id, status, driver_id, pickups_only, vehicle_id, route_stops(pickup_id)")
    .eq("delivery_date", date)
    .is("seller_id", null);
  // Solo rehace su propia ruta de retiros si aún no sale; los demás retiros ya tienen ruta
  const mine = (existing ?? []).filter((r) => r.pickups_only && r.driver_id === driverId && (r.status === "borrador" || r.status === "publicada"));
  const mineIds = new Set(mine.map((r) => r.id));
  const taken = new Set(
    (existing ?? []).filter((r) => !mineIds.has(r.id)).flatMap((r) => (r.route_stops as { pickup_id: string | null }[]).map((s) => s.pickup_id).filter(Boolean) as string[]),
  );
  const pickups = await pickupsOfDay(db, date, taken);
  if (mine.length) await db.from("delivery_routes").delete().in("id", [...mineIds]);
  if (!pickups.length) return empty;

  const busy = new Set((existing ?? []).filter((r) => !mineIds.has(r.id) && r.status === "en_curso").map((r) => r.vehicle_id));
  const free = vehicles.filter((v) => !busy.has(v.id));
  const vehicle =
    free.find((v) => v.id === vehicleId) ??
    free.find((v) => v.driver_id === driverId) ??
    [...free].sort((a, b) => Number(b.capacity_m3) - Number(a.capacity_m3))[0];
  if (!vehicle) {
    return { ...empty, unassigned: pickups.map((o) => ({ orderId: o.id, title: o.products?.title ?? "Retiro", reason: "No hay vehículos disponibles" })) };
  }
  await db.from("route_stops").delete().in("pickup_id", pickups.map((o) => o.id));

  return optimizeAndSave(db, {
    date, sellerId: null, settings, fleet: [vehicle], orders: pickups,
    fixedCost: () => 0,
    balance: false,
    status: "publicada",
    driverFor: () => driverId,
    pickupsOnly: true,
  });
}

/** Ubica, optimiza y guarda las rutas (compartido por el plan del día y la ruta de retiros). */
async function optimizeAndSave(
  db: Db,
  p: {
    date: string;
    sellerId: SellerScope;
    settings: DeliverySettings;
    fleet: Vehicle[];
    orders: PlanOrder[];
    fixedCost: (v: Vehicle) => number;
    balance: boolean;
    status: "borrador" | "publicada";
    driverFor: (v: Vehicle) => string | null;
    pickupsOnly: boolean;
  },
): Promise<PlanSummary & { routeId?: string }> {
  const { date, sellerId, settings, fleet, orders } = p;
  await locateOrders(db, orders);
  const depot = await depotPoint(db, settings, sellerId);
  // Una parada por dirección de compra (los productos de un mismo carrito llegan juntos)
  const groups = groupByCheckout(orders);
  const points: Point[] = [depot, ...groups.map((g) => ({ lat: g[0].lat!, lng: g[0].lng! }))];
  const startSec = toSeconds(settings.start_time);
  const endSec = toSeconds(settings.end_time);
  const matrix = await travelMatrix(points, santiagoToDate(date, startSec), startSec);

  const stops: OptStop[] = groups.map((g, i) => {
    const o = g[0];
    const load = stopLoad(g);
    const tw = slotWindow((o.delivery_slot ?? "cualquiera") as DeliverySlot, settings);
    return {
      id: o.id, node: i + 1, kg: load.kg, m3: load.m3, sizeRank: load.rank,
      service: (settings.service_minutes + load.serviceMin) * 60, twStart: tw[0], twEnd: tw[1],
      pickup: Boolean(o.pickup),
    };
  });
  const optVehicles: OptVehicle[] = fleet.map((v) => ({
    id: v.id,
    capKg: Number(v.capacity_kg),
    capM3: Number(v.capacity_m3),
    maxSizeRank: SIZES[v.max_item_size]?.rank ?? 3,
    costPerKm: v.cost_per_km,
    start: startSec,
    end: endSec,
    startNode: 0,
    endNode: 0,
    // Usar un vehículo más tiene un costo fijo: prefiere juntar pedidos si alcanza
    fixedCost: p.fixedCost(v),
  }));

  const result = optimizeRoutes(stops, optVehicles, matrix, {
    timeLimitMs: Math.min(8000, 1500 + groups.length * 120),
    balance: p.balance,
    seed: Number(date.replace(/-/g, "")),
  });

  const byId = new Map(orders.map((o) => [o.id, o]));
  const groupOf = new Map(groups.map((g) => [g[0].id, g]));
  let distance = 0;
  let routeId: string | undefined;
  for (const [i, r] of result.routes.entries()) {
    const v = fleet.find((x) => x.id === r.vehicleId)!;
    distance += r.distance;
    const { data: route, error } = await db
      .from("delivery_routes")
      .insert({
        delivery_date: date,
        seller_id: sellerId,
        vehicle_id: v.id,
        driver_id: p.driverFor(v),
        status: p.status,
        ...(p.status === "publicada" ? { published_at: new Date().toISOString() } : {}),
        ...(p.pickupsOnly ? { pickups_only: true } : {}),
        color: ROUTE_COLORS[((p.pickupsOnly ? 3 : 0) + i) % ROUTE_COLORS.length],
        planned_start: santiagoToDate(date, r.departure).toISOString(),
        planned_end: santiagoToDate(date, r.end).toISOString(),
        planned_distance_m: Math.round(r.distance),
        planned_duration_s: Math.round(r.duration),
        load_kg: Math.round(r.kg * 10) / 10,
        load_m3: Math.round(r.m3 * 1000) / 1000,
        traffic_source: matrix.source,
      })
      .select("id")
      .single();
    if (error || !route) throw new Error(error?.message ?? "No se pudo guardar la ruta");
    routeId ??= route.id as string;
    const stopRows = r.visits.flatMap((vis, k) => {
      const g = groupOf.get(vis.id)!;
      const tw = slotWindow((g[0].delivery_slot ?? "cualquiera") as DeliverySlot, settings);
      const [ws, we] = promisedWindow(vis.start, settings, tw);
      // Todos los pedidos de la compra comparten parada (mismo número, hora y ventana)
      return g.map((o, j) => ({
        route_id: route.id,
        ...(o.pickup ? { pickup_id: o.id } : { order_id: o.id }),
        seq: k + 1,
        eta: santiagoToDate(date, vis.start).toISOString(),
        window_start: santiagoToDate(date, ws).toISOString(),
        window_end: santiagoToDate(date, we).toISOString(),
        leg_distance_m: j === 0 ? Math.round(vis.legDist) : 0,
      }));
    });
    const { error: e2 } = await db.from("route_stops").insert(stopRows);
    if (e2) throw new Error(e2.message);
  }

  const planned = new Set(result.routes.flatMap((r) => r.visits.map((v) => v.id)));
  return {
    date,
    routeId,
    routes: result.routes.length,
    stops: result.routes.reduce((a, r) => a + r.visits.length, 0),
    pickups: orders.filter((o) => o.pickup && planned.has(o.id)).length,
    unassigned: result.unassigned.flatMap((u) =>
      (groupOf.get(u.id) ?? [byId.get(u.id)!]).map((o) => ({
        orderId: o.id,
        title: `${o?.pickup ? "Retiro: " : ""}${o?.products?.title ?? "Pedido"}`,
        reason: u.reason,
      })),
    ),
    source: matrix.source,
    distanceKm: Math.round(distance / 100) / 10,
    iterations: result.iterations,
    ms: result.ms,
  };
}

/** Publica las rutas del día: avisa a cada comprador su ventana de entrega. */
export async function publishDay(date: string, sellerId: SellerScope = null) {
  const db = createAdminClient();
  let q = db.from("delivery_routes").select("id").eq("delivery_date", date).eq("status", "borrador");
  q = sellerId ? q.eq("seller_id", sellerId) : q.is("seller_id", null);
  const { data: routes } = await q;
  const ids = (routes ?? []).map((r) => r.id);
  if (!ids.length) return 0;
  await db.from("delivery_routes").update({ status: "publicada", published_at: new Date().toISOString() }).in("id", ids);
  const { data: stops } = await db
    .from("route_stops")
    .select("id, route_id, seq, window_start, window_end, orders(id, user_id, product_id, products(title))")
    .in("route_id", ids);
  // Los productos de una misma compra comparten parada: un solo aviso por parada
  const bySeq = new Map<string, NonNullable<typeof stops>>();
  for (const s of stops ?? []) {
    const k = `${s.route_id}:${s.seq}`;
    bySeq.set(k, [...(bySeq.get(k) ?? []), s]);
  }
  let sent = 0;
  for (const group of bySeq.values()) {
    const s = group[0];
    const o = s.orders as unknown as { id: string; user_id: string | null; product_id: string; products: { title: string } | null } | null;
    if (!o || !s.window_start || !s.window_end) continue;
    const what = group.length > 1 ? `Tus ${group.length} productos llegan` : `${o.products?.title ?? "Tu compra"} llega`;
    await notifyOrder(db, o, "entrega_fecha", `Tu pedido llega el ${formatDeliveryDate(date, { weekday: "long", day: "numeric", month: "long" })}`,
      `${what} entre las ${formatTime(s.window_start)} y las ${formatTime(s.window_end)}. Te avisamos cuando vayamos en camino.`);
    await db.from("route_stops").update({ notified_window_at: new Date().toISOString() }).in("id", group.map((x) => x.id));
    sent++;
  }
  return sent;
}

type StopRow = {
  id: string;
  seq: number;
  status: string;
  window_start: string | null;
  window_end: string | null;
  delivered_lat: number | null;
  delivered_lng: number | null;
  delivered_at: string | null;
  orders: PlanOrder & { delivery_date: string };
};

/**
 * Recalcula el orden de las paradas que faltan de una ruta,
 * desde la ubicación actual del chofer (o la última entrega) y la hora actual.
 */
export async function reoptimizeRoute(routeId: string, from: Point | null) {
  const db = createAdminClient();
  const { data: route } = await db.from("delivery_routes").select("*, vehicles(*)").eq("id", routeId).single();
  if (!route) throw new Error("Ruta no encontrada");
  const sellerId = (route.seller_id as string | null) ?? null;
  const settings = await getDeliverySettings(db, sellerId);
  const { data: rows } = await db
    .from("route_stops")
    .select(`id, seq, status, window_start, window_end, delivered_lat, delivered_lng, delivered_at, orders(${ORDER_FIELDS}, delivery_date), pickups(${PICKUP_PLAN_FIELDS}, pickup_date)`)
    .eq("route_id", routeId)
    .order("seq");
  // Los retiros se recalculan igual que las entregas (con la forma de un pedido)
  const all = ((rows ?? []) as unknown as (StopRow & { pickups: (PickupPlanRow & { pickup_date: string }) | null })[]).map((r) =>
    r.pickups ? { ...r, orders: { ...pickupJob(r.pickups), delivery_date: r.pickups.pickup_date } } : r,
  ) as StopRow[];
  const done = all.filter((s) => s.status === "entregado" || s.status === "fallido");
  const pending = all.filter((s) => s.status === "pendiente" || s.status === "en_camino");
  if (!pending.length) return { changed: 0 };

  await locateOrders(db, pending.map((s) => s.orders));
  const lastDone = [...done].reverse().find((s) => s.delivered_lat != null);
  const depot = await depotPoint(db, settings, sellerId);
  const start: Point = from ?? (lastDone ? { lat: lastDone.delivered_lat!, lng: lastDone.delivered_lng! } : depot);

  const date = route.delivery_date as string;
  const now = santiagoParts(new Date());
  const startSec = now.date === date ? Math.max(now.seconds, 0) : toSeconds(settings.start_time);
  // Paradas con varios productos de una misma compra se mueven juntas
  const groups = [...pending.reduce((m, s) => m.set(s.seq, [...(m.get(s.seq) ?? []), s]), new Map<number, StopRow[]>()).values()];
  const groupOf = new Map(groups.map((g) => [g[0].id, g]));
  const points: Point[] = [depot, start, ...groups.map((g) => ({ lat: g[0].orders.lat!, lng: g[0].orders.lng! }))];
  const matrix = await travelMatrix(points, now.date === date ? new Date() : santiagoToDate(date, startSec), startSec);
  const v = route.vehicles as Vehicle | null;

  const stops: OptStop[] = groups.map((g, i) => {
    const s = g[0];
    const load = stopLoad(g.map((x) => x.orders));
    // Respeta la ventana que ya se le prometió al comprador
    const tw: [number, number] = s.window_start && s.window_end
      ? [santiagoParts(new Date(s.window_start)).seconds, santiagoParts(new Date(s.window_end)).seconds]
      : slotWindow((s.orders.delivery_slot ?? "cualquiera") as DeliverySlot, settings);
    return { id: s.id, node: i + 2, kg: load.kg, m3: load.m3, sizeRank: 0, service: (settings.service_minutes + load.serviceMin) * 60, twStart: tw[0], twEnd: tw[1], pickup: Boolean(s.orders.pickup) };
  });
  const result = optimizeRoutes(
    stops,
    [{
      id: routeId, capKg: 1e9, capM3: 1e9, maxSizeRank: 3, costPerKm: v?.cost_per_km ?? 250,
      start: startSec, end: Math.max(toSeconds(settings.end_time), startSec + 3600), startNode: 1, endNode: 0,
    }],
    matrix,
    { timeLimitMs: Math.min(4000, 800 + groups.length * 150), hardLimits: false, seed: Date.now() % 100000 },
  );
  const r = result.routes[0];
  if (!r) return { changed: 0 };

  let changed = 0;
  const base = new Set(done.map((s) => s.seq)).size;
  for (const [k, vis] of r.visits.entries()) {
    const group = groupOf.get(vis.id)!;
    const old = group[0];
    const update: Record<string, unknown> = { seq: base + k + 1, eta: santiagoToDate(date, vis.start).toISOString(), leg_distance_m: Math.round(vis.legDist) };
    // Si la nueva hora cae fuera de la ventana avisada, se corre la ventana y se avisa
    const ws = old.window_start ? new Date(old.window_start).getTime() : null;
    const we = old.window_end ? new Date(old.window_end).getTime() : null;
    const eta = santiagoToDate(date, vis.start).getTime();
    if (route.status !== "borrador" && ws != null && we != null && (eta > we + 10 * 60_000 || eta < ws - 30 * 60_000)) {
      const W = settings.window_minutes * 60_000;
      const nws = new Date(Math.floor((eta - W * 0.35) / 900_000) * 900_000);
      const nwe = new Date(nws.getTime() + W);
      update.window_start = nws.toISOString();
      update.window_end = nwe.toISOString();
      if (!old.orders.pickup) await notifyOrder(db, old.orders, "entrega_fecha", "Actualizamos el horario de tu entrega",
        `${group.length > 1 ? `Tus ${group.length} productos llegan` : `${old.orders.products?.title ?? "Tu compra"} llega`} entre las ${formatTime(nws)} y las ${formatTime(nwe)}.`);
      changed++;
    }
    if (old.seq !== base + k + 1) changed++;
    await db.from("route_stops").update(update).eq("id", vis.id);
    if (group.length > 1) {
      const { leg_distance_m: _leg, ...rest } = update;
      void _leg;
      await db.from("route_stops").update({ ...rest, leg_distance_m: 0 }).in("id", group.slice(1).map((x) => x.id));
    }
  }
  await db.from("delivery_routes").update({
    planned_end: santiagoToDate(date, r.end).toISOString(),
    planned_distance_m: Math.round(r.distance),
    traffic_source: matrix.source,
  }).eq("id", routeId);
  return { changed };
}

/** Próximo día de despacho para mover un pedido que no se pudo entregar. */
export async function nextDeliveryDateAfter(date: string, sellerId: SellerScope = null) {
  const s = await getDeliverySettings(createAdminClient(), sellerId);
  return upcomingDeliveryDates(s, new Date(), 8).find((d) => d > date) ?? null;
}

/**
 * Fecha de entrega para un pedido nuevo: el próximo día de despacho que tenga
 * espacio en la flota (si un día ya va lleno, pasa al siguiente).
 * null = el reparto aún no está configurado (sin tablas o sin vehículos).
 */
export async function deliveryDateFor(load: { kg: number; m3: number; rank: number }, sellerId: SellerScope = null) {
  const db = createAdminClient();
  const { settings } = await readDeliverySettings(db, sellerId);
  if (!settings) return null;
  const vehicles = await getVehicles(db, true, sellerId);
  if (!vehicles.length) return null;
  const dates = upcomingDeliveryDates(settings, new Date(), 6);
  if (!dates.length) return null;

  // Solo cuentan los vehículos que pueden llevar este tamaño
  const able = vehicles.filter((v) => (SIZES[v.max_item_size]?.rank ?? 3) >= load.rank);
  if (!able.length) return { date: dates[0], settings };
  const capM3 = able.reduce((a, v) => a + Number(v.capacity_m3), 0) * 0.9;
  const capKg = able.reduce((a, v) => a + Number(v.capacity_kg), 0) * 0.9;

  let usedQ = db
    .from("orders")
    .select("delivery_date, quantity, products(size, category_slug, weight_kg, volume_m3)")
    .eq("delivery", "despacho")
    .in("status", ["paid", "pending"])
    .in("delivery_date", dates)
    .is("delivered_at", null);
  usedQ = sellerId ? usedQ.eq("seller_id", sellerId) : usedQ.is("seller_id", null);
  const { data: rows } = await usedQ;
  const used = new Map<string, { kg: number; m3: number }>();
  for (const r of (rows ?? []) as unknown as { delivery_date: string; quantity: number; products: Parameters<typeof orderLoad>[0] | null }[]) {
    const l = orderLoad(r.products ?? {}, r.quantity);
    const u = used.get(r.delivery_date) ?? { kg: 0, m3: 0 };
    used.set(r.delivery_date, { kg: u.kg + l.kg, m3: u.m3 + l.m3 });
  }
  const date = dates.find((d) => {
    const u = used.get(d) ?? { kg: 0, m3: 0 };
    return u.m3 + load.m3 <= capM3 && u.kg + load.kg <= capKg;
  }) ?? dates[dates.length - 1];
  return { date, settings };
}
