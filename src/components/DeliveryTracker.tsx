import { Icon, type IconName } from "@/components/Icon";
import { formatDeliveryDate, formatTime } from "@/lib/delivery";

export type TrackerStop = {
  status: "pendiente" | "en_camino" | "entregado" | "fallido";
  eta: string | null;
  window_start: string | null;
  window_end: string | null;
  delivered_at: string | null;
  received_by: string | null;
  failure_reason: string | null;
  receipt_code: string;
};

/** Seguimiento de la entrega para el comprador: fecha, ventana, en camino y comprobante. */
export function DeliveryTracker({
  orderId,
  date,
  slotText,
  stop,
  published,
  proof,
}: {
  orderId: string;
  date: string | null;
  slotText: string | null;
  stop: TrackerStop | null;
  published: boolean;
  proof: { photo: string | null; signature: string | null };
}) {
  const steps: { icon: IconName; title: string; text: string; done: boolean; active: boolean }[] = [
    {
      icon: "calendar",
      title: date ? `Llega el ${formatDeliveryDate(date)}` : "Fecha de entrega por confirmar",
      text: stop && published && stop.window_start && stop.window_end
        ? `Entre las ${formatTime(stop.window_start)} y las ${formatTime(stop.window_end)}.`
        : slotText
          ? `${slotText}. El día anterior te avisamos una ventana más precisa.`
          : "Te avisamos cuando tengamos la ventana horaria.",
      done: Boolean(stop && published),
      active: !stop || !published,
    },
    {
      icon: "truck",
      title: "En camino",
      text: stop?.status === "en_camino"
        ? `Eres la próxima entrega${stop.eta ? `: llegamos cerca de las ${formatTime(stop.eta)}` : ""}.`
        : "Te avisamos cuando seas la próxima entrega.",
      done: stop?.status === "entregado",
      active: stop?.status === "en_camino",
    },
    {
      icon: stop?.status === "fallido" ? "fail" : "ok",
      title: stop?.status === "fallido" ? "No pudimos entregar" : "Entregado",
      text: stop?.status === "entregado"
        ? `Recibió ${stop.received_by ?? ""}${stop.delivered_at ? ` a las ${formatTime(stop.delivered_at)}` : ""}.`
        : stop?.status === "fallido"
          ? `${stop.failure_reason ?? ""}. Te escribiremos para coordinar una nueva fecha.`
          : "Con foto y firma como respaldo.",
      done: stop?.status === "entregado",
      active: stop?.status === "fallido",
    },
  ];

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 text-left">
      <h2 className="font-extrabold">Seguimiento de tu despacho</h2>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${s.done ? "bg-accent text-white" : s.active ? "bg-brand text-white" : "bg-surface text-muted"}`}
            >
              <Icon name={s.icon} className="h-5 w-5" />
            </span>
            <div>
              <p className={`font-bold ${s.done || s.active ? "" : "text-muted"}`}>{s.title}</p>
              <p className="text-sm text-muted">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
      {stop?.status === "entregado" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {proof.photo && <img src={proof.photo} alt="Foto de la entrega" className="aspect-square w-full rounded-xl object-cover" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {proof.signature && <img src={proof.signature} alt="Firma de quien recibió" className="aspect-square w-full rounded-xl border border-border bg-white object-contain" />}
          </div>
          <a
            href={`/api/entregas/${orderId}/comprobante`}
            className="flex items-center justify-center gap-2 rounded-full bg-foreground py-3 font-extrabold text-background"
          >
            <Icon name="down" className="h-5 w-5" /> Descargar comprobante (PDF)
          </a>
          <p className="text-center text-xs text-muted">Código de entrega {stop.receipt_code}</p>
        </div>
      )}
    </section>
  );
}
