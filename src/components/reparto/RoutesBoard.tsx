import type { ReactNode } from "react";
import Link from "next/link";
import { brand } from "@/brand";
import { createAdminClient } from "@/lib/supabase/admin";
import { Icon } from "@/components/Icon";
import { StatusDot, type StatusTone } from "@/components/StatusDot";
import { RouteMap } from "@/components/RouteMap";
import {
  SIZES, VEHICLE_KINDS, addDays, formatDeliveryDate, formatTime, orderLoad, santiagoParts, slotLabel, upcomingDeliveryDates,
  whatsappLink, type DeliverySlot, type Vehicle,
} from "@/lib/delivery";
import { getDeliverySettings } from "@/lib/routing/planner";
import { STOP_SELECT, normalizeStops, type RouteRow, type StopOrder, type StopRow } from "@/lib/routing/operations";
import { SANTIAGO_CENTER } from "@/lib/routing/geo";
import type { PlanState } from "@/lib/routing/manage";
import { PlanForm } from "./PlanForm";

export type RoutesActions = {
  plan: (p: PlanState, f: FormData) => Promise<PlanState>;
  publish: (f: FormData) => Promise<void>;
  assignDriver: (f: FormData) => Promise<void>;
  reoptimize: (f: FormData) => Promise<void>;
  moveOrder: (f: FormData) => Promise<void>;
};

const ROUTE_STATUS: Record<RouteRow["status"], { tone: StatusTone; label: string }> = {
  borrador: { tone: "off", label: "Borrador (sin avisar)" },
  publicada: { tone: "info", label: "Publicada: compradores avisados" },
  en_curso: { tone: "warn", label: "En ruta" },
  terminada: { tone: "ok", label: "Terminada" },
};
const STOP_STATUS: Record<StopRow["status"], { tone: StatusTone; label: string }> = {
  pendiente: { tone: "off", label: "Pendiente" },
  en_camino: { tone: "warn", label: "En camino" },
  entregado: { tone: "ok", label: "Entregado" },
  fallido: { tone: "bad", label: "No entregado" },
};

type Order = StopOrder & { delivery_date: string | null };

/** Rutas del día con mapa (admin de MUVEO con sellerId null, o panel del vendedor). */
export async function RoutesBoard({
  sellerId,
  fecha,
  tabs,
  actions,
  drivers,
  setupHref,
}: {
  sellerId: string | null;
  fecha: string | undefined;
  tabs?: ReactNode;
  actions: RoutesActions;
  drivers: { id: string; name: string }[];
  setupHref: string;
}) {
  const db = createAdminClient();
  const scoped = <T,>(q: T): T =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sellerId ? (q as any).eq("seller_id", sellerId) : (q as any).is("seller_id", null)) as T;

  const probe = await db.from("delivery_routes").select("id, seller_id").limit(1);
  if (probe.error) {
    return (
      <div className="space-y-6">
        {tabs}
        <p className="rounded-2xl bg-brand-soft p-4 text-sm font-bold">
          {sellerId
            ? "El reparto todavía no está disponible. Avísale al equipo de MUVEO."
            : "Faltan las tablas de reparto. En Supabase, abre SQL Editor y corre 20261116100000_rutas_despacho.sql y 20261116110000_reparto_vendedores.sql."}
        </p>
      </div>
    );
  }

  const settings = await getDeliverySettings(db, sellerId);
  const today = santiagoParts(new Date()).date;
  const upcoming = upcomingDeliveryDates(settings, new Date(), 4);
  const { data: recent } = await scoped(db.from("delivery_routes").select("delivery_date").gte("delivery_date", addDays(today, -14)));
  const dates = [...new Set([...(recent ?? []).map((r) => r.delivery_date as string), today, ...upcoming])].sort();
  const selected = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : (upcoming.find((d) => d >= today) ?? today);

  const ORDER_SELECT = "id, user_id, product_id, quantity, amount, buyer_name, buyer_phone, buyer_email, address, address_notes, comuna, delivery_slot, delivery_date, lat, lng, seller_id, products(title, images, size, category_slug, weight_kg, volume_m3)";
  const [{ data: routesData }, { data: dayOrders }, { data: noDate }, { data: vehiclesData }] = await Promise.all([
    scoped(db.from("delivery_routes").select("*, vehicles(*)").eq("delivery_date", selected).order("created_at")),
    scoped(db.from("orders").select(ORDER_SELECT).eq("status", "paid").eq("delivery", "despacho").eq("delivery_date", selected).is("delivered_at", null)),
    scoped(db.from("orders").select(ORDER_SELECT).eq("status", "paid").eq("delivery", "despacho").is("delivery_date", null).is("delivered_at", null)),
    scoped(db.from("vehicles").select("*").eq("active", true)),
  ]);
  const routes = (routesData ?? []) as (RouteRow & { vehicles: Vehicle | null })[];
  const vehicles = (vehiclesData ?? []) as Vehicle[];
  const { data: stopsData } = routes.length
    ? await db.from("route_stops").select(STOP_SELECT).in("route_id", routes.map((r) => r.id)).order("seq")
    : { data: [] };
  const stops = normalizeStops<StopRow>(stopsData);
  const planned = new Set(stops.map((s) => s.order_id));
  // Retiros del día (lo que regalan los clientes): solo en las rutas de MUVEO
  const { data: dayPickups } = sellerId
    ? { data: [] }
    : await db.from("pickups").select("id").eq("pickup_date", selected).in("status", ["pendiente", "fallido"]);
  const plannedPickups = new Set(stops.map((s) => s.pickup_id).filter(Boolean));
  const pickupsWithoutRoute = (dayPickups ?? []).filter((p) => !plannedPickups.has(p.id as string)).length;
  const pendingOrders = ((dayOrders ?? []) as unknown as Order[]).filter((o) => !planned.has(o.id));
  const backlog = (noDate ?? []) as unknown as Order[];

  const allOrders = [...((dayOrders ?? []) as unknown as Order[]), ...backlog];
  const load = allOrders.reduce((a, o) => {
    const l = orderLoad(o.products ?? {}, o.quantity);
    return { kg: a.kg + l.kg, m3: a.m3 + l.m3 };
  }, { kg: 0, m3: 0 });
  const fleet = vehicles.reduce((a, v) => ({ kg: a.kg + Number(v.capacity_kg), m3: a.m3 + Number(v.capacity_m3) }), { kg: 0, m3: 0 });
  const hasDraft = routes.some((r) => r.status === "borrador");
  const depot = settings.depot_lat != null && settings.depot_lng != null ? { lat: settings.depot_lat, lng: settings.depot_lng } : SANTIAGO_CENTER;
  const nextDates = upcomingDeliveryDates(settings, new Date(), 6).filter((d) => d !== selected);

  return (
    <div className="space-y-6">
      {tabs}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Rutas del día</h1>
          <p className="text-muted">
            Despacho los {settings.days.map((d) => ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"][d]).join(" y ")}
            , con corte a las {String(settings.cutoff_hour).padStart(2, "0")}:00 del día anterior.
          </p>
        </div>
      </div>

      <nav className="flex gap-2 overflow-x-auto pb-1">
        {dates.map((d) => (
          <Link
            key={d}
            href={`?fecha=${d}`}
            className={`shrink-0 rounded-2xl border-2 px-4 py-2 text-left ${d === selected ? "border-foreground bg-surface" : "border-border"}`}
          >
            <span className="block text-xs font-bold uppercase text-muted">{d === today ? "Hoy" : formatDeliveryDate(d, { weekday: "short" })}</span>
            <span className="block font-extrabold">{formatDeliveryDate(d, { day: "numeric", month: "short" })}</span>
          </Link>
        ))}
      </nav>

      {vehicles.length === 0 && (
        <p className="rounded-2xl bg-brand-soft p-4 text-sm font-bold">
          Primero agrega tus vehículos en <Link href={setupHref} className="underline">Vehículos y horarios</Link>.
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="Pedidos del día" value={String((dayOrders ?? []).length + backlog.length)} hint={backlog.length ? `${backlog.length} sin fecha se suman` : `${pendingOrders.length} sin ruta`} />
        <Stat label="Volumen" value={`${load.m3.toFixed(1)} m³`} hint={fleet.m3 ? `${Math.round((load.m3 / fleet.m3) * 100)}% de la flota` : "Sin vehículos"} />
        <Stat label="Peso" value={`${Math.round(load.kg)} kg`} hint={fleet.kg ? `${Math.round((load.kg / fleet.kg) * 100)}% de la flota` : ""} />
        <Stat label="Rutas" value={String(routes.length)} hint={`${stops.filter((s) => s.status === "entregado").length} de ${stops.length} listas${(dayPickups ?? []).length ? ` · ${(dayPickups ?? []).length} retiros` : ""}`} />
      </section>

      <div className="flex flex-wrap items-start gap-3">
        <PlanForm date={selected} hasRoutes={routes.length > 0} disabled={vehicles.length === 0} planAction={actions.plan} />
        {hasDraft && (
          <form action={actions.publish}>
            <input type="hidden" name="date" value={selected} />
            <button className="flex items-center gap-2 rounded-full bg-brand px-6 py-3 font-extrabold text-white">
              <Icon name="bell" className="h-5 w-5" />
              Publicar y avisar a los compradores
            </button>
          </form>
        )}
      </div>

      {routes.length > 0 && (
        <RouteMap
          className="h-[420px]"
          depot={depot}
          live={routes.filter((r) => r.status === "en_curso").map((r) => ({ routeId: r.id, name: r.vehicles?.name ?? "Vehículo", color: r.color }))}
          routes={routes.map((r) => ({
            id: r.id,
            color: r.color,
            stops: stops.filter((s) => s.route_id === r.id && s.orders.lat != null).map((s) => ({
              lat: s.orders.lat!, lng: s.orders.lng!, seq: s.seq, title: `${s.orders.products?.title ?? ""} · ${s.orders.comuna ?? ""}`, status: s.status,
            })),
          }))}
        />
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {routes.map((r) => {
          const rs = stops.filter((s) => s.route_id === r.id);
          const v = r.vehicles;
          const pctKg = v ? Math.round((Number(r.load_kg) / Number(v.capacity_kg)) * 100) : 0;
          const pctM3 = v ? Math.round((Number(r.load_m3) / Number(v.capacity_m3)) * 100) : 0;
          return (
            <section key={r.id} className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="mt-1 h-4 w-4 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold">
                    {v?.name ?? "Vehículo borrado"} <span className="text-sm font-bold text-muted">{v ? VEHICLE_KINDS[v.kind]?.label : ""}{v?.plate ? ` · ${v.plate}` : ""}</span>
                  </p>
                  <p className="text-sm text-muted">
                    {rs.filter((s) => s.kind === "entrega").length} entregas{rs.some((s) => s.kind === "retiro") ? ` y ${rs.filter((s) => s.kind === "retiro").length} retiros` : ""} · {(r.planned_distance_m / 1000).toFixed(1)} km · {r.planned_start ? formatTime(r.planned_start) : "—"} a {r.planned_end ? formatTime(r.planned_end) : "—"}
                  </p>
                  <p className="text-sm"><StatusDot {...ROUTE_STATUS[r.status]} /></p>
                </div>
                <Link href={`/reparto/${r.id}`} className="rounded-full border border-border px-3 py-1.5 text-xs font-bold">Vista chofer</Link>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <Bar label="Volumen" pct={pctM3} text={`${Number(r.load_m3).toFixed(2)} de ${v?.capacity_m3 ?? "?"} m³`} color={r.color} />
                <Bar label="Peso" pct={pctKg} text={`${Math.round(Number(r.load_kg))} de ${v?.capacity_kg ?? "?"} kg`} color={r.color} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <form action={actions.assignDriver} className="flex items-center gap-2">
                  <input type="hidden" name="routeId" value={r.id} />
                  <select name="driver_id" defaultValue={r.driver_id ?? ""} className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm">
                    <option value="">Sin chofer</option>
                    {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <button className="rounded-full border border-border px-3 py-1.5 text-xs font-bold">Asignar</button>
                </form>
                {r.status !== "terminada" && (
                  <form action={actions.reoptimize}>
                    <input type="hidden" name="routeId" value={r.id} />
                    <button className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-bold">
                      <Icon name="rotate" className="h-3.5 w-3.5" /> Recalcular orden
                    </button>
                  </form>
                )}
              </div>

              <ol className="divide-y divide-border">
                {rs.map((s) => {
                  const o = s.orders;
                  const pickup = s.kind === "retiro";
                  const wa = pickup
                    ? whatsappLink(o.buyer_phone, `Hola ${o.buyer_name.split(" ")[0]}, te escribimos de ${brand.name}: pasamos a retirar ${o.products?.title} el ${formatDeliveryDate(selected)} entre las ${s.window_start ? formatTime(s.window_start) : ""} y las ${s.window_end ? formatTime(s.window_end) : ""}.`)
                    : whatsappLink(o.buyer_phone, `Hola ${o.buyer_name.split(" ")[0]}, te escribimos de ${brand.name}: tu pedido "${o.products?.title}" llega el ${formatDeliveryDate(selected)} entre las ${s.window_start ? formatTime(s.window_start) : ""} y las ${s.window_end ? formatTime(s.window_end) : ""}.`);
                  return (
                    <li key={s.id} className="flex gap-3 py-2 text-sm">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black text-white" style={{ background: s.status === "fallido" ? "var(--pass)" : r.color }}>{s.seq}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{pickup && <span className="mr-1 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-black uppercase text-background">Retiro</span>}{o.products?.title}{o.quantity > 1 ? ` × ${o.quantity}` : ""} <span className="font-normal text-muted">· {SIZES[orderLoad(o.products ?? {}).size].label}</span></p>
                        <p className="truncate text-muted">{o.buyer_name} · {o.address}</p>
                        <p className="text-xs text-muted">
                          Llega {s.eta ? formatTime(s.eta) : "—"} · ventana {s.window_start ? formatTime(s.window_start) : ""}–{s.window_end ? formatTime(s.window_end) : ""} · {slotLabel((o.delivery_slot ?? "cualquiera") as DeliverySlot, settings).split(" (")[0]}
                        </p>
                        {s.failure_reason && <p className="text-xs font-bold text-pass">{s.failure_reason}</p>}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                        <StatusDot {...(pickup && s.status === "entregado" ? { tone: "ok" as const, label: "Retirado" } : pickup && s.status === "fallido" ? { tone: "bad" as const, label: "No retirado" } : STOP_STATUS[s.status])} />
                        {pickup ? (
                          <Link href={`/reparto/parada/${s.id}`} className="font-bold text-brand">{s.status === "entregado" ? "Fotos y firma" : "Ver"}</Link>
                        ) : s.status === "entregado" ? (
                          <a href={`/api/entregas/${o.id}/comprobante`} className="font-bold text-brand">PDF</a>
                        ) : (
                          <>
                            {wa && <a href={wa} target="_blank" rel="noreferrer" className="font-bold text-accent">WhatsApp</a>}
                            <form action={actions.moveOrder}>
                              <input type="hidden" name="orderId" value={o.id} />
                              <input type="hidden" name="from" value={selected} />
                              <button className="font-bold text-muted hover:text-foreground">Mover al próximo día</button>
                            </form>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>

      {pickupsWithoutRoute > 0 && (
        <p className="rounded-2xl bg-surface p-4 text-sm">
          <b>{pickupsWithoutRoute} retiro{pickupsWithoutRoute === 1 ? "" : "s"} sin ruta.</b> Se suman al planificar este día (mezclados con las entregas si conviene). <Link href={`/admin/despacho/retiros?fecha=${selected}`} className="font-bold underline">Ver retiros</Link>
        </p>
      )}

      {(pendingOrders.length > 0 || backlog.length > 0) && (
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold">Pedidos sin ruta</h2>
          <p className="text-sm text-muted">Se incluyen la próxima vez que planifiques este día.{backlog.length ? " Los pedidos sin fecha (anteriores a este sistema) se suman solos." : ""}</p>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {[...pendingOrders, ...backlog].map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{o.products?.title}{o.quantity > 1 ? ` × ${o.quantity}` : ""}</p>
                  <p className="text-muted">{o.buyer_name} · {o.address}{o.delivery_date ? "" : " · sin fecha"}</p>
                </div>
                <form action={actions.moveOrder} className="flex items-center gap-2">
                  <input type="hidden" name="orderId" value={o.id} />
                  <select name="to" defaultValue="" className="rounded-xl border border-border bg-background px-2 py-1.5 text-xs">
                    <option value="" disabled>Mover a…</option>
                    {nextDates.map((d) => <option key={d} value={d}>{formatDeliveryDate(d, { weekday: "short", day: "numeric", month: "short" })}</option>)}
                  </select>
                  <button className="rounded-full border border-border px-3 py-1.5 text-xs font-bold">Mover</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <p className="text-2xl font-black">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Bar({ label, pct, text, color }: { label: string; pct: number; text: string; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between"><span className="font-bold">{label}</span><span className="text-muted">{pct}%</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      <p className="text-muted">{text}</p>
    </div>
  );
}
