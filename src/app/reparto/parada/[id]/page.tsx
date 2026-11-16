import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { hasSupabaseEnv } from "@/lib/env";
import { SetupNotice } from "@/components/SetupNotice";
import { Icon } from "@/components/Icon";
import { loadStop, proofUrls, siblingStops } from "@/lib/routing/operations";
import { SIZES, formatTime, mapsDirections, orderLoad, wazeLink } from "@/lib/delivery";
import { DeliveryForm } from "./DeliveryForm";

export const metadata: Metadata = { title: "Entrega" };

export default async function ParadaPage({ params }: PageProps<"/reparto/parada/[id]">) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { id } = await params;
  const { stop, db } = await loadStop(id);
  const o = stop.orders;
  const load = orderLoad(o.products ?? {}, o.quantity);
  const img = o.products?.images?.[0];
  const phone = (o.buyer_phone ?? "").replace(/[^\d+]/g, "");
  // Productos de la misma compra: se entregan juntos en esta parada
  const siblings = await siblingStops(db, stop);

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link href={`/reparto/${stop.route_id}`} className="inline-flex items-center gap-1 text-sm font-bold text-muted"><Icon name="back" className="h-4 w-4" />Volver a la ruta</Link>

      <div className="flex gap-4 rounded-2xl border border-border bg-card p-3">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-surface">
          {img && <Image src={img} alt="" fill sizes="96px" className="object-contain" />}
        </div>
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs font-black uppercase text-muted">Parada {stop.seq}</p>
          <p className="font-extrabold">{o.products?.title}{o.quantity > 1 ? ` × ${o.quantity}` : ""}</p>
          <p className="text-sm">{o.address}</p>
          <p className="text-xs text-muted">{SIZES[load.size].label} · {o.buyer_name} · ventana {stop.window_start ? formatTime(stop.window_start) : ""}–{stop.window_end ? formatTime(stop.window_end) : ""}</p>
        </div>
      </div>
      {siblings.length > 0 && (
        <section className="space-y-2 rounded-2xl border-2 border-foreground p-3">
          <p className="flex items-center gap-2 text-sm font-extrabold"><Icon name="box" className="h-5 w-5" />Esta entrega lleva {siblings.length + 1} productos</p>
          <ul className="space-y-1 text-sm">
            {[stop, ...siblings].map((x) => (
              <li key={x.id} className="flex justify-between gap-2">
                <span>{x.orders.products?.title ?? "Producto"}{x.orders.quantity > 1 ? ` × ${x.orders.quantity}` : ""}</span>
                <span className="text-xs text-muted">{SIZES[orderLoad(x.orders.products ?? {}, 1).size].label}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Una sola firma y foto sirven para todos.</p>
        </section>
      )}
      {o.address_notes && <p className="rounded-xl bg-surface p-3 text-sm"><b>Indicaciones:</b> {o.address_notes}</p>}

      <div className="grid grid-cols-3 gap-2 text-sm font-bold">
        <a href={mapsDirections({ lat: o.lat, lng: o.lng, address: o.address })} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 rounded-2xl border border-border p-3"><Icon name="navigation" />Maps</a>
        <a href={wazeLink({ lat: o.lat, lng: o.lng, address: o.address })} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 rounded-2xl border border-border p-3"><Icon name="navigation" />Waze</a>
        {phone ? (
          <a href={`tel:${phone}`} className="flex flex-col items-center gap-1 rounded-2xl border border-border p-3"><Icon name="phone" />Llamar</a>
        ) : <span />}
      </div>

      {stop.status === "entregado" ? (
        <Delivered stop={stop} urls={await proofUrls(db, stop)} />
      ) : stop.status === "fallido" ? (
        <div className="space-y-3">
          <p className="rounded-2xl bg-pass/10 p-4 font-bold text-pass">No entregado: {stop.failure_reason}</p>
          <DeliveryForm stopId={stop.id} routeId={stop.route_id} defaultName={o.buyer_name} />
        </div>
      ) : (
        <DeliveryForm stopId={stop.id} routeId={stop.route_id} defaultName={o.buyer_name} />
      )}
    </div>
  );
}

function Delivered({ stop, urls }: { stop: Awaited<ReturnType<typeof loadStop>>["stop"]; urls: { photo: string | null; signature: string | null } }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 font-extrabold text-accent"><Icon name="ok" className="h-5 w-5" />Entregado a las {stop.delivered_at ? formatTime(stop.delivered_at) : ""}</p>
      <p className="text-sm">Recibió {stop.received_by}{stop.receiver_rut ? ` (RUT ${stop.receiver_rut})` : ""}</p>
      <div className="grid grid-cols-2 gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {urls.photo && <img src={urls.photo} alt="Foto de la entrega" className="aspect-square w-full rounded-xl object-cover" />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {urls.signature && <img src={urls.signature} alt="Firma" className="aspect-square w-full rounded-xl border border-border bg-white object-contain" />}
      </div>
      <a href={`/api/entregas/${stop.order_id}/comprobante`} className="flex items-center justify-center gap-2 rounded-full border-2 border-border py-3 font-extrabold">
        <Icon name="down" className="h-5 w-5" /> Descargar comprobante PDF
      </a>
    </section>
  );
}
