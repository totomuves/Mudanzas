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
async function depotPoint(db: Db, s: DeliverySettings, sellerId: SellerScope = null): Promise<Point> {
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
  products: { title: string; size: string | null; category_slug: string; weight_kg: number | null; volume_m3: number | null } | null;
};

const ORDER_FIELDS = "id, user_id, product_id, quantity, address, comuna, delivery_slot, lat, lng, buyer_name, products(title, size, category_slug, weight_kg, volume_m3)";

/** Ubica en el mapa los pedidos que aún no tienen coordenadas. */
async function locateOrders(db: Db, orders: PlanOrder[]) {
  for (const o of orders) {
    if (o.lat != null && o.lng != null) continue;
    const p = await geocode((o.address ?? "").trim() || (o.comuna ?? ""), o.comuna);
    o.lat = p.lat;
    o.lng = p.lng;
    await db.from("orders").update({ lat: p.lat, lng: p.lng, geo_source: p.source }).eq("id", o.id);
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

  let routesQ = db.from("delivery_routes").select("id, status, vehicle_id, route_stops(order_id)").eq("delivery_date", date);
  routesQ = sellerId ? routesQ.eq("seller_id", sellerId) : routesQ.is("seller_id", null);
  const { data: existing } = await routesQ;
  const locked = (existing ?? []).filter((r) => r.status === "en_curso" || r.status === "terminada");
  const lockedOrders = new Set(locked.flatMap((r) => (r.route_stops as { order_id: string }[]).map((s) => s.order_id)));
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
  const orders = ((rows ?? []) as unknown as PlanOrder[]).filter((o) => !lockedOrders.has(o.id));

  // Las paradas viejas de estos pedidos (de otro día o de un intento fallido) se reemplazan
  if (orders.length) await db.from("route_stops").delete().in("order_id", orders.map((o) => o.id));
  if (replace.length) await db.from("delivery_routes").delete().in("id", replace);

  const fleet = vehicles.filter((v) => !busyVehicles.has(v.id));
  const empty: PlanSummary = { date, routes: 0, stops: 0, unassigned: [], source: "estimado", distanceKm: 0, iterations: 0, ms: 0 };
  if (!orders.length) return empty;
  if (!fleet.length) {
    return { ...empty, unassigned: orders.map((o) => ({ orderId: o.id, title: o.products?.title ?? "Pedido", reason: "No hay vehículos disponibles" })) };
  }

  await locateOrders(db, orders);
  const depot = await depotPoint(db, settings, sellerId);
  const points: Point[] = [depot, ...orders.map((o) => ({ lat: o.lat!, lng: o.lng! }))];
  const startSec = toSeconds(settings.start_time);
  const endSec = toSeconds(settings.end_time);
  const matrix = await travelMatrix(points, santiagoToDate(date, startSec), startSec);

  const stops: OptStop[] = orders.map((o, i) => {
    const load = orderLoad(o.products ?? {}, o.quantity);
    const tw = slotWindow((o.delivery_slot ?? "cualquiera") as DeliverySlot, settings);
    return {
      id: o.id, node: i + 1, kg: load.kg, m3: load.m3, sizeRank: load.rank,
      service: (settings.service_minutes + load.serviceMin) * 60, twStart: tw[0], twEnd: tw[1],
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
    fixedCost: settings.balance_routes ? 0 : 6000 + v.cost_per_km * 10,
  }));

  const result = optimizeRoutes(stops, optVehicles, matrix, {
    timeLimitMs: Math.min(8000, 1500 + orders.length * 120),
    balance: settings.balance_routes,
    seed: Number(date.replace(/-/g, "")),
  });

  const byId = new Map(orders.map((o) => [o.id, o]));
  let distance = 0;
  for (const [i, r] of result.routes.entries()) {
    const v = fleet.find((x) => x.id === r.vehicleId)!;
    distance += r.distance;
    const { data: route, error } = await db
      .from("delivery_routes")
      .insert({
        delivery_date: date,
        seller_id: sellerId,
        vehicle_id: v.id,
        driver_id: v.driver_id,
        status: "borrador",
        color: ROUTE_COLORS[i % ROUTE_COLORS.length],
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
    const stopRows = r.visits.map((vis, k) => {
      const o = byId.get(vis.id)!;
      const tw = slotWindow((o.delivery_slot ?? "cualquiera") as DeliverySlot, settings);
      const [ws, we] = promisedWindow(vis.start, settings, tw);
      return {
        route_id: route.id,
        order_id: o.id,
        seq: k + 1,
        eta: santiagoToDate(date, vis.start).toISOString(),
        window_start: santiagoToDate(date, ws).toISOString(),
        window_end: santiagoToDate(date, we).toISOString(),
        leg_distance_m: Math.round(vis.legDist),
      };
    });
    const { error: e2 } = await db.from("route_stops").insert(stopRows);
    if (e2) throw new Error(e2.message);
  }

  return {
    date,
    routes: result.routes.length,
    stops: orders.length - result.unassigned.length,
    unassigned: result.unassigned.map((u) => ({ orderId: u.id, title: byId.get(u.id)?.products?.title ?? "Pedido", reason: u.reason })),
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
    .select("id, window_start, window_end, orders(id, user_id, product_id, products(title))")
    .in("route_id", ids);
  let sent = 0;
  for (const s of stops ?? []) {
    const o = s.orders as unknown as { id: string; user_id: string | null; product_id: string; products: { title: string } | null } | null;
    if (!o || !s.window_start || !s.window_end) continue;
    await notifyOrder(db, o, "entrega_fecha", `Tu pedido llega el ${formatDeliveryDate(date, { weekday: "long", day: "numeric", month: "long" })}`,
      `${o.products?.title ?? "Tu compra"} llega entre las ${formatTime(s.window_start)} y las ${formatTime(s.window_end)}. Te avisamos cuando vayamos en camino.`);
    await db.from("route_stops").update({ notified_window_at: new Date().toISOString() }).eq("id", s.id);
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
    .select(`id, seq, status, window_start, window_end, delivered_lat, delivered_lng, delivered_at, orders(${ORDER_FIELDS}, delivery_date)`)
    .eq("route_id", routeId)
    .order("seq");
  const all = (rows ?? []) as unknown as StopRow[];
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
  const points: Point[] = [depot, start, ...pending.map((s) => ({ lat: s.orders.lat!, lng: s.orders.lng! }))];
  const matrix = await travelMatrix(points, now.date === date ? new Date() : santiagoToDate(date, startSec), startSec);
  const v = route.vehicles as Vehicle | null;

  const stops: OptStop[] = pending.map((s, i) => {
    const load = orderLoad(s.orders.products ?? {}, s.orders.quantity);
    // Respeta la ventana que ya se le prometió al comprador
    const tw: [number, number] = s.window_start && s.window_end
      ? [santiagoParts(new Date(s.window_start)).seconds, santiagoParts(new Date(s.window_end)).seconds]
      : slotWindow((s.orders.delivery_slot ?? "cualquiera") as DeliverySlot, settings);
    return { id: s.id, node: i + 2, kg: load.kg, m3: load.m3, sizeRank: 0, service: (settings.service_minutes + load.serviceMin) * 60, twStart: tw[0], twEnd: tw[1] };
  });
  const result = optimizeRoutes(
    stops,
    [{
      id: routeId, capKg: 1e9, capM3: 1e9, maxSizeRank: 3, costPerKm: v?.cost_per_km ?? 250,
      start: startSec, end: Math.max(toSeconds(settings.end_time), startSec + 3600), startNode: 1, endNode: 0,
    }],
    matrix,
    { timeLimitMs: Math.min(4000, 800 + pending.length * 150), hardLimits: false, seed: Date.now() % 100000 },
  );
  const r = result.routes[0];
  if (!r) return { changed: 0 };

  let changed = 0;
  const base = done.length;
  for (const [k, vis] of r.visits.entries()) {
    const old = pending.find((s) => s.id === vis.id)!;
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
      await notifyOrder(db, old.orders, "entrega_fecha", "Actualizamos el horario de tu entrega",
        `${old.orders.products?.title ?? "Tu compra"} llega entre las ${formatTime(nws)} y las ${formatTime(nwe)}.`);
      changed++;
    }
    if (old.seq !== base + k + 1) changed++;
    await db.from("route_stops").update(update).eq("id", vis.id);
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
