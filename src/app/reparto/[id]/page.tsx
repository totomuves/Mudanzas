import type { Metadata } from "next";
import Link from "next/link";
import { hasSupabaseEnv } from "@/lib/env";
import { SetupNotice } from "@/components/SetupNotice";
import { Icon } from "@/components/Icon";
import { loadRoute } from "@/lib/routing/operations";
import { getDeliverySettings } from "@/lib/routing/planner";
import { SIZES, formatDeliveryDate, formatTime, mapsDirections, orderLoad, wazeLink } from "@/lib/delivery";
import { DriverMap, RouteControls } from "../RouteControls";

export const metadata: Metadata = { title: "Ruta" };
export const maxDuration = 30;

export default async function RutaChoferPage({ params, searchParams }: PageProps<"/reparto/[id]">) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { id } = await params;
  const sp = await searchParams;
  const { route, stops, db } = await loadRoute(id);
  const settings = await getDeliverySettings(db);
  const depot = settings.depot_lat != null && settings.depot_lng != null ? { lat: settings.depot_lat, lng: settings.depot_lng } : null;

  const open = stops.filter((s) => s.status === "pendiente" || s.status === "en_camino");
  const current = open[0] ?? null;
  const done = stops.length - open.length;
  // Ruta completa en Google Maps con las próximas paradas (máx. 9 intermedias)
  const located = open.filter((s) => s.orders.lat != null).map((s) => ({ lat: s.orders.lat!, lng: s.orders.lng! }));
  const next10 = located.slice(0, 10);
  const fullRoute = next10.length ? mapsDirections(next10[next10.length - 1], next10.slice(0, -1)) : null;

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link href="/reparto" className="inline-flex items-center gap-1 text-sm font-bold text-muted"><Icon name="back" className="h-4 w-4" />Mis rutas</Link>
      <div>
        <h1 className="text-2xl font-black">{formatDeliveryDate(route.delivery_date)}</h1>
        <p className="text-muted">
          {route.vehicles?.name ?? "Vehículo"} · {done} de {stops.length} entregas · {(route.planned_distance_m / 1000).toFixed(0)} km
        </p>
      </div>

      {typeof sp.entregado === "string" && (
        <p className="flex items-center gap-2 rounded-2xl bg-accent/10 p-3 font-bold text-accent">
          <Icon name="ok" className="h-5 w-5" /> Entrega registrada. El comprador ya tiene su comprobante.
        </p>
      )}

      <DriverMap
        depot={depot}
        routes={[{
          id: route.id,
          color: route.color,
          stops: stops.filter((s) => s.orders.lat != null).map((s) => ({ lat: s.orders.lat!, lng: s.orders.lng!, seq: s.seq, title: s.orders.products?.title ?? "", status: s.status })),
        }]}
      />

      <RouteControls routeId={route.id} status={route.status} hasPending={open.length > 0} />

      {current && (
        <section className="space-y-3 rounded-2xl border-2 p-4" style={{ borderColor: route.color }}>
          <p className="text-xs font-black uppercase" style={{ color: route.color }}>
            {current.status === "en_camino" ? "Vas en camino a" : "Próxima entrega"} · parada {current.seq}
          </p>
          <StopInfo stop={current} />
          <div className="grid grid-cols-2 gap-2">
            <a href={mapsDirections({ lat: current.orders.lat, lng: current.orders.lng, address: current.orders.address })} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-full bg-foreground py-3 font-extrabold text-background">
              <Icon name="navigation" className="h-5 w-5" /> Google Maps
            </a>
            <a href={wazeLink({ lat: current.orders.lat, lng: current.orders.lng, address: current.orders.address })} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-full border-2 border-border py-3 font-extrabold">
              <Icon name="navigation" className="h-5 w-5" /> Waze
            </a>
          </div>
          <Link href={`/reparto/parada/${current.id}`} className="flex items-center justify-center gap-2 rounded-full bg-brand py-4 text-lg font-extrabold text-white">
            <Icon name="check" className="h-6 w-6" /> Registrar entrega
          </Link>
        </section>
      )}

      {fullRoute && open.length > 1 && (
        <a href={fullRoute} target="_blank" rel="noreferrer" className="block text-center text-sm font-bold text-brand">
          Abrir las próximas {Math.min(10, open.length)} paradas en Google Maps
        </a>
      )}

      <ol className="divide-y divide-border rounded-2xl border border-border bg-card">
        {stops.map((s) => (
          <li key={s.id} className={`flex gap-3 p-3 ${s.status === "entregado" || s.status === "fallido" ? "opacity-60" : ""}`}>
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black text-white"
              style={{ background: s.status === "fallido" ? "var(--pass)" : route.color }}
            >
              {s.status === "entregado" ? <Icon name="check" className="h-4 w-4" strokeWidth={3} /> : s.status === "fallido" ? <Icon name="x" className="h-4 w-4" strokeWidth={3} /> : s.seq}
            </span>
            <Link href={`/reparto/parada/${s.id}`} className="min-w-0 flex-1">
              <p className="truncate font-bold">{s.orders.products?.title}{s.orders.quantity > 1 ? ` × ${s.orders.quantity}` : ""}</p>
              <p className="truncate text-sm text-muted">{s.orders.address}</p>
              <p className="text-xs text-muted">
                {s.status === "entregado" && s.delivered_at ? `Entregado ${formatTime(s.delivered_at)}` : s.status === "fallido" ? `No entregado: ${s.failure_reason ?? ""}` : `Llegada ${s.eta ? formatTime(s.eta) : "—"} · avisado ${s.window_start ? formatTime(s.window_start) : ""}–${s.window_end ? formatTime(s.window_end) : ""}`}
              </p>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StopInfo({ stop }: { stop: Awaited<ReturnType<typeof loadRoute>>["stops"][number] }) {
  const o = stop.orders;
  const load = orderLoad(o.products ?? {}, o.quantity);
  const phone = (o.buyer_phone ?? "").replace(/[^\d+]/g, "");
  return (
    <div className="space-y-1">
      <p className="text-lg font-extrabold">{o.products?.title}{o.quantity > 1 ? ` × ${o.quantity}` : ""}</p>
      <p className="text-sm">{o.address}</p>
      {o.address_notes && <p className="rounded-xl bg-surface p-2 text-sm"><b>Indicaciones:</b> {o.address_notes}</p>}
      <p className="text-sm text-muted">
        {o.buyer_name} · {SIZES[load.size].label}{load.rank >= 3 ? " (2 personas)" : ""} · ventana {stop.window_start ? formatTime(stop.window_start) : ""}–{stop.window_end ? formatTime(stop.window_end) : ""}
      </p>
      {phone && (
        <div className="flex gap-4 pt-1 text-sm font-bold">
          <a href={`tel:${phone}`} className="flex items-center gap-1 text-brand"><Icon name="phone" className="h-4 w-4" />Llamar</a>
          <a href={`https://wa.me/${phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-accent"><Icon name="mail" className="h-4 w-4" />WhatsApp</a>
        </div>
      )}
    </div>
  );
}
