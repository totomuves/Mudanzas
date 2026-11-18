import "server-only";
import type { RouteWaypoint } from "@/lib/delivery";
import { notFound, redirect } from "next/navigation";
import { getAdminAccess } from "@/lib/admin";
import { getMarketplaceEnabled } from "@/lib/seller";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatTime, santiagoParts } from "@/lib/delivery";
import { haversine, trafficFactor } from "./optimizer";
import { notifyOrder } from "./notify";
import { brand } from "@/brand";

type Db = ReturnType<typeof createAdminClient>;

/**
 * Choferes (sección Reparto), quienes administran Despacho y los vendedores
 * aprobados (reparten sus propios pedidos).
 */
export async function requireDriver(next = "/reparto") {
  const access = await getAdminAccess();
  if (!access.user || access.user.is_anonymous) redirect(`/ingresar?next=${encodeURIComponent(next)}`);
  // Vendedor aprobado con el marketplace encendido
  const { data: seller } = await createAdminClient().from("sellers").select("id, status").eq("owner_id", access.user.id).maybeSingle();
  const sellerId = seller?.status === "approved" && (await getMarketplaceEnabled()) ? (seller.id as string) : null;
  if (!access.sections.includes("reparto") && !access.sections.includes("despacho") && !sellerId) redirect("/admin/sin-permiso");
  return { ...access, user: access.user, canManage: access.sections.includes("despacho"), sellerId };
}

/** ¿Puede esta persona ver y operar la ruta? */
export function canAccessRoute(
  access: { user: { id: string }; canManage: boolean; sellerId: string | null },
  route: { driver_id: string | null; seller_id?: string | null },
) {
  if (route.driver_id === access.user.id) return true;
  if (route.seller_id) return route.seller_id === access.sellerId || access.canManage;
  return access.canManage;
}

export type RouteRow = {
  id: string;
  delivery_date: string;
  seller_id?: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
  status: "borrador" | "publicada" | "en_curso" | "terminada";
  color: string;
  planned_start: string | null;
  planned_end: string | null;
  planned_distance_m: number;
  planned_duration_s: number;
  /** Parking y bodegas por donde pasa (si ya se corrió la migración de bodegas) */
  waypoints?: RouteWaypoint[] | null;
  load_kg: number;
  load_m3: number;
  traffic_source: string;
  started_at: string | null;
  finished_at: string | null;
  published_at: string | null;
};

export type StopOrder = {
  id: string;
  user_id: string | null;
  product_id: string;
  quantity: number;
  amount: number;
  buyer_name: string;
  buyer_phone: string | null;
  buyer_email: string;
  address: string | null;
  address_notes: string | null;
  comuna: string | null;
  delivery_slot: string;
  lat: number | null;
  lng: number | null;
  seller_id: string | null;
  products: { title: string; images: string[]; size: string | null; category_slug: string; weight_kg: number | null; volume_m3: number | null } | null;
};

export type PickupRow = {
  id: string;
  pickup_date: string | null;
  slot: string;
  contact_name: string;
  contact_phone: string | null;
  address: string;
  comuna: string | null;
  address_notes: string | null;
  items: string;
  size: string | null;
  volume_m3: number | null;
  weight_kg: number | null;
  lat: number | null;
  lng: number | null;
  status: "solicitado" | "rechazado" | "pendiente" | "retirado" | "fallido" | "cancelado";
  picked_at: string | null;
  photo_paths: string[];
  donation_terms: string | null;
};

export const PICKUP_FIELDS =
  "id, pickup_date, slot, contact_name, contact_phone, address, comuna, address_notes, items, size, volume_m3, weight_kg, lat, lng, status, picked_at, photo_paths, donation_terms";

export type StopRow = {
  id: string;
  route_id: string;
  /** Entrega: id del pedido. Retiro: null (ver pickup). */
  order_id: string;
  pickup_id: string | null;
  /** "entrega" o "retiro" */
  kind: "entrega" | "retiro";
  pickup: PickupRow | null;
  seq: number;
  eta: string | null;
  window_start: string | null;
  window_end: string | null;
  leg_distance_m: number;
  status: "pendiente" | "en_camino" | "entregado" | "fallido";
  delivered_at: string | null;
  received_by: string | null;
  receiver_rut: string | null;
  signature_path: string | null;
  photo_path: string | null;
  delivered_lat: number | null;
  delivered_lng: number | null;
  delivered_accuracy_m: number | null;
  failure_reason: string | null;
  receipt_code: string;
  /** En un retiro trae los datos del retiro con la misma forma (para mapas y listas). */
  orders: StopOrder;
};

export const STOP_SELECT =
  `*, orders(id, user_id, product_id, quantity, amount, buyer_name, buyer_phone, buyer_email, address, address_notes, comuna, delivery_slot, lat, lng, seller_id, products(title, images, size, category_slug, weight_kg, volume_m3)), pickups(${PICKUP_FIELDS})`;

/** Datos de un retiro con la forma de un pedido (dirección, contacto, tamaño). */
export function pickupAsOrder(p: PickupRow): StopOrder {
  return {
    id: p.id, user_id: null, product_id: "", quantity: 1, amount: 0,
    buyer_name: p.contact_name, buyer_phone: p.contact_phone, buyer_email: "",
    address: p.comuna && !p.address.includes(p.comuna) ? `${p.address}, ${p.comuna}` : p.address,
    address_notes: p.address_notes, comuna: p.comuna, delivery_slot: p.slot, lat: p.lat, lng: p.lng, seller_id: null,
    products: { title: p.items, images: [], size: p.size, category_slug: "", weight_kg: p.weight_kg, volume_m3: p.volume_m3 },
  };
}

/** Deja cada parada con kind, pickup y orders siempre presentes. */
export function normalizeStops<T>(rows: T[] | null | undefined): (T & StopRow)[] {
  return ((rows ?? []) as unknown as (StopRow & { pickups?: PickupRow | null; orders: StopOrder | null })[]).map((r) => {
    const pickup = r.pickups ?? null;
    return {
      ...r,
      kind: pickup ? "retiro" : "entrega",
      pickup,
      orders: pickup ? pickupAsOrder(pickup) : (r.orders as StopOrder),
    };
  }) as unknown as (T & StopRow)[];
}

/** Ruta con sus paradas, solo si la persona puede verla. */
export async function loadRoute(routeId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(routeId)) notFound();
  const access = await requireDriver(`/reparto/${routeId}`);
  const db = createAdminClient();
  const { data: route } = await db.from("delivery_routes").select("*, vehicles(*)").eq("id", routeId).maybeSingle();
  if (!route || !canAccessRoute(access, route)) notFound();
  const { data: stops } = await db.from("route_stops").select(STOP_SELECT).eq("route_id", routeId).order("seq");
  return { access, db, route: route as RouteRow & { vehicles: { name: string; kind: string; plate: string | null } | null }, stops: normalizeStops<StopRow>(stops) };
}

export async function loadStop(stopId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(stopId)) notFound();
  const access = await requireDriver(`/reparto/parada/${stopId}`);
  const db = createAdminClient();
  const { data } = await db.from("route_stops").select(`${STOP_SELECT}, delivery_routes(*)`).eq("id", stopId).maybeSingle();
  const stop = data ? normalizeStops<StopRow & { delivery_routes: RouteRow }>([data])[0] : null;
  if (!stop || !canAccessRoute(access, stop.delivery_routes)) notFound();
  return { access, db, stop };
}

/**
 * Otras paradas de la misma entrega: los productos de una compra del carrito
 * comparten número de parada y se entregan juntos (una firma, una foto).
 */
export async function siblingStops(db: Db, stop: Pick<StopRow, "id" | "route_id" | "seq">) {
  const { data } = await db.from("route_stops").select(STOP_SELECT).eq("route_id", stop.route_id).eq("seq", stop.seq).neq("id", stop.id);
  return normalizeStops<StopRow>(data);
}

/** Minutos estimados para llegar de un punto a otro ahora. */
function etaMinutes(from: { lat: number; lng: number } | null, to: { lat: number | null; lng: number | null }) {
  if (!from || to.lat == null || to.lng == null) return null;
  const d = haversine(from, { lat: to.lat, lng: to.lng }) * 1.32;
  const s = (d / (32 / 3.6) + 60) * trafficFactor(santiagoParts(new Date()).seconds);
  return Math.max(5, Math.round(s / 60));
}

/** Pasa a la siguiente parada: queda "en camino" y se avisa al comprador. */
export async function advanceRoute(db: Db, routeId: string, from: { lat: number; lng: number } | null) {
  const { data } = await db.from("route_stops").select(STOP_SELECT).eq("route_id", routeId).in("status", ["pendiente", "en_camino"]).order("seq").limit(1);
  const next = normalizeStops<StopRow>(data)[0] ?? null;
  if (!next) {
    await db.from("delivery_routes").update({ status: "terminada", finished_at: new Date().toISOString() }).eq("id", routeId);
    return null;
  }
  if (next.status === "pendiente") {
    const mins = etaMinutes(from, next.orders);
    const eta = mins ? new Date(Date.now() + mins * 60_000) : next.eta ? new Date(next.eta) : null;
    const siblings = (await siblingStops(db, next)).filter((x) => x.status === "pendiente");
    await db
      .from("route_stops")
      .update({ status: "en_camino", notified_onway_at: new Date().toISOString(), ...(eta ? { eta: eta.toISOString() } : {}) })
      .in("id", [next.id, ...siblings.map((x) => x.id)]);
    const what = siblings.length ? `Tus ${siblings.length + 1} productos son` : `${next.orders.products?.title ?? "Tu pedido"} es`;
    // Quien regala no tiene cuenta: el chofer le avisa por WhatsApp desde su pantalla
    if (next.kind === "entrega") await notifyOrder(db, next.orders, "entrega_camino", "Vamos en camino",
      `${what} la próxima entrega${eta ? `: llegamos cerca de las ${formatTime(eta)}` : ""}. Ten a mano tu nombre y RUT para firmar.`);
  }
  return next;
}

export async function startRoute(routeId: string, from: { lat: number; lng: number } | null) {
  const { db, route } = await loadRoute(routeId);
  if (route.status === "terminada") return;
  if (route.status !== "en_curso") {
    await db.from("delivery_routes").update({ status: "en_curso", started_at: new Date().toISOString() }).eq("id", routeId);
  }
  await advanceRoute(db, routeId, from);
}

const MAX_UPLOAD = 4 * 1024 * 1024;

export async function completeStop(
  stopId: string,
  input: { receivedBy: string; rut: string; lat: number | null; lng: number | null; accuracy: number | null; signature: File; photo: File | null },
) {
  const { db, stop } = await loadStop(stopId);
  if (stop.status === "entregado") return { ok: true as const };
  if (stop.kind === "retiro") return { ok: false as const, error: "Esta parada es un retiro." };
  if (!input.signature || input.signature.size < 200 || input.signature.size > MAX_UPLOAD || !input.signature.type.startsWith("image/")) {
    return { ok: false as const, error: "Falta la firma." };
  }
  if (input.photo && (input.photo.size > MAX_UPLOAD || !input.photo.type.startsWith("image/"))) {
    return { ok: false as const, error: "La foto es muy pesada. Intenta de nuevo." };
  }

  const base = `${stop.route_id}/${stop.id}`;
  const sigPath = `${base}/firma.png`;
  const up1 = await db.storage.from("entregas").upload(sigPath, input.signature, { contentType: "image/png", upsert: true });
  if (up1.error) return { ok: false as const, error: `No se pudo guardar la firma: ${up1.error.message}` };
  let photoPath: string | null = null;
  if (input.photo && input.photo.size > 0) {
    photoPath = `${base}/foto.${input.photo.type.includes("png") ? "png" : input.photo.type.includes("webp") ? "webp" : "jpg"}`;
    const up2 = await db.storage.from("entregas").upload(photoPath, input.photo, { contentType: input.photo.type, upsert: true });
    if (up2.error) return { ok: false as const, error: `No se pudo guardar la foto: ${up2.error.message}` };
  }

  const now = new Date().toISOString();
  // La misma firma y foto valen para todos los productos de esta entrega
  const siblings = (await siblingStops(db, stop)).filter((x) => x.status !== "entregado");
  const stopIds = [stop.id, ...siblings.map((x) => x.id)];
  await db.from("route_stops").update({
    status: "entregado",
    delivered_at: now,
    received_by: input.receivedBy,
    receiver_rut: input.rut || null,
    signature_path: sigPath,
    photo_path: photoPath,
    delivered_lat: input.lat,
    delivered_lng: input.lng,
    delivered_accuracy_m: input.accuracy != null ? Math.round(input.accuracy) : null,
    failure_reason: null,
  }).in("id", stopIds);

  // El pedido queda entregado. En ventas de vendedores empieza el plazo de revisión del comprador.
  let releaseAt: string | null = null;
  if (stop.orders.seller_id) {
    const { data: m } = await db.from("marketplace_settings").select("review_days").eq("id", 1).maybeSingle();
    releaseAt = new Date(Date.now() + (m?.review_days ?? 3) * 86_400_000).toISOString();
  }
  await db
    .from("orders")
    .update({ delivered_at: now, ...(releaseAt ? { release_at: releaseAt } : {}) })
    .in("id", [stop.order_id, ...siblings.map((x) => x.order_id)])
    .is("delivered_at", null);

  await notifyOrder(db, stop.orders, "entrega_lista", siblings.length ? `Entregamos tus ${siblings.length + 1} productos` : "Entregado",
    `Recibió ${input.receivedBy}. Puedes descargar el comprobante con la firma y la foto.`);

  const here = input.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng } : null;
  if (stop.delivery_routes.status !== "terminada") await advanceRoute(db, stop.route_id, here);
  return { ok: true as const };
}

/** Texto que firma quien regala los productos. */
export function donationTerms(items: string, brandName: string) {
  return `Entrego sin costo a ${brandName} lo siguiente: ${items}. Lo hago voluntariamente, es mío o tengo permiso para entregarlo, está en buen estado y funcionando, y acepto que ${brandName} pase a ser su dueño y lo pueda usar, vender o regalar, sin pagarme nada a cambio.`;
}

const MAX_PICKUP_PHOTOS = 4;

/** Retiro hecho: fotos de lo recibido + firma de quien lo entrega, aceptando el texto. */
export async function completePickup(
  stopId: string,
  input: { donorName: string; rut: string; lat: number | null; lng: number | null; accuracy: number | null; signature: File; photos: File[] },
) {
  const { db, stop } = await loadStop(stopId);
  if (stop.kind !== "retiro" || !stop.pickup) return { ok: false as const, error: "Esta parada no es un retiro." };
  if (stop.status === "entregado") return { ok: true as const };
  if (!input.signature || input.signature.size < 200 || input.signature.size > MAX_UPLOAD || !input.signature.type.startsWith("image/")) {
    return { ok: false as const, error: "Falta la firma de quien regala." };
  }
  const photos = input.photos.filter((f) => f.size > 0).slice(0, MAX_PICKUP_PHOTOS);
  if (!photos.length) return { ok: false as const, error: "Toma al menos una foto de lo que retiras." };
  if (photos.some((f) => f.size > MAX_UPLOAD || !f.type.startsWith("image/"))) return { ok: false as const, error: "Una foto es muy pesada. Intenta de nuevo." };

  const base = `retiros/${stop.pickup.id}`;
  const sigPath = `${base}/firma.png`;
  const up = await db.storage.from("entregas").upload(sigPath, input.signature, { contentType: "image/png", upsert: true });
  if (up.error) return { ok: false as const, error: `No se pudo guardar la firma: ${up.error.message}` };
  const paths: string[] = [];
  for (const [i, f] of photos.entries()) {
    const path = `${base}/foto-${i + 1}.jpg`;
    const r = await db.storage.from("entregas").upload(path, f, { contentType: f.type || "image/jpeg", upsert: true });
    if (r.error) return { ok: false as const, error: `No se pudo guardar la foto: ${r.error.message}` };
    paths.push(path);
  }

  const now = new Date().toISOString();
  await db.from("route_stops").update({
    status: "entregado",
    delivered_at: now,
    received_by: input.donorName,
    receiver_rut: input.rut || null,
    signature_path: sigPath,
    photo_path: paths[0],
    delivered_lat: input.lat,
    delivered_lng: input.lng,
    delivered_accuracy_m: input.accuracy != null ? Math.round(input.accuracy) : null,
    failure_reason: null,
  }).eq("id", stop.id);
  await db.from("pickups").update({ status: "retirado", picked_at: now, photo_paths: paths, donation_terms: donationTerms(stop.pickup.items, brand.name) }).eq("id", stop.pickup.id);

  const here = input.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng } : null;
  if (stop.delivery_routes.status !== "terminada") await advanceRoute(db, stop.route_id, here);
  return { ok: true as const };
}

export async function failStop(stopId: string, reason: string, here: { lat: number; lng: number } | null) {
  const { db, stop } = await loadStop(stopId);
  if (stop.status === "entregado") return;
  if (stop.kind === "retiro") {
    await db.from("route_stops").update({ status: "fallido", failure_reason: reason, delivered_lat: here?.lat ?? null, delivered_lng: here?.lng ?? null }).eq("id", stop.id);
    if (stop.pickup) await db.from("pickups").update({ status: "fallido" }).eq("id", stop.pickup.id);
    await advanceRoute(db, stop.route_id, here);
    return;
  }
  const siblings = (await siblingStops(db, stop)).filter((x) => x.status !== "entregado");
  await db.from("route_stops").update({
    status: "fallido",
    failure_reason: reason,
    delivered_lat: here?.lat ?? null,
    delivered_lng: here?.lng ?? null,
  }).in("id", [stop.id, ...siblings.map((x) => x.id)]);
  await notifyOrder(db, stop.orders, "entrega_fallida", "No pudimos entregar tu pedido",
    `Pasamos pero no fue posible entregar (${reason.toLowerCase()}). Te escribiremos para coordinar una nueva fecha.`);
  await advanceRoute(db, stop.route_id, here);
}

/** Enlaces firmados (válidos 1 hora) de las fotos de un retiro. */
export async function signedPaths(db: Db, paths: string[]) {
  return Promise.all(paths.map(async (p) => (await db.storage.from("entregas").createSignedUrl(p, 3600)).data?.signedUrl ?? null));
}

/** Enlaces firmados (válidos 1 hora) para ver la foto y la firma. */
export async function proofUrls(db: Db, stop: Pick<StopRow, "signature_path" | "photo_path">) {
  const sign = async (p: string | null) => (p ? (await db.storage.from("entregas").createSignedUrl(p, 3600)).data?.signedUrl ?? null : null);
  const [signature, photo] = await Promise.all([sign(stop.signature_path), sign(stop.photo_path)]);
  return { signature, photo };
}
