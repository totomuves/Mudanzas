"use client";

import { useActionState, useMemo, useState } from "react";
import { COMUNAS } from "@/lib/comunas";
import { formatCLP } from "@/lib/format";
import { Icon, ServiceIcon } from "@/components/Icon";
import {
  computeQuote,
  DISTANCES,
  formatDay,
  isSaturday,
  type DistanceKey,
  type MovingSettings,
  type ServiceType,
} from "@/lib/moving";
import { createBooking, type BookingState } from "./actions";

export type Slot = { day: string; slot_time: string; remaining: number };

const STEPS = ["Servicio", "Direcciones", "Extras", "Fecha", "Contacto"];

export function QuoteWizard({
  services,
  settings,
  slots,
  initialService,
}: {
  services: ServiceType[];
  settings: MovingSettings;
  slots: Slot[];
  initialService?: string;
}) {
  const [state, action, pending] = useActionState<BookingState, FormData>(createBooking, {});
  const [step, setStep] = useState(initialService && services.some((s) => s.slug === initialService) ? 1 : 0);
  const [f, setF] = useState({
    service_slug: services.some((s) => s.slug === initialService) ? initialService! : services[0].slug,
    origin_address: "",
    origin_comuna: "",
    origin_floor: 1,
    origin_elevator: false,
    dest_address: "",
    dest_comuna: "",
    dest_floor: 1,
    dest_elevator: false,
    distance: "cerca" as DistanceKey,
    packing: false,
    heavy_items: 0,
    notes: "",
    day: "",
    slot_time: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const service = services.find((s) => s.slug === f.service_slug) ?? services[0];
  const quote = computeQuote(
    {
      service,
      distance: f.distance,
      originFloor: f.origin_floor,
      originElevator: f.origin_elevator,
      destFloor: f.dest_floor,
      destElevator: f.dest_elevator,
      packing: f.packing,
      heavyItems: f.heavy_items,
      day: f.day || null,
    },
    settings,
  );

  const days = useMemo(() => {
    const map = new Map<string, Slot[]>();
    slots.forEach((s) => map.set(s.day, [...(map.get(s.day) ?? []), s]));
    return [...map.entries()];
  }, [slots]);
  const daySlots = days.find(([d]) => d === f.day)?.[1] ?? [];

  const canNext = [
    Boolean(f.service_slug),
    f.origin_address.length >= 4 && f.dest_address.length >= 4 && f.origin_comuna && f.dest_comuna,
    true,
    Boolean(f.day && f.slot_time),
    true,
  ][step];

  const input = "w-full rounded-xl border border-border bg-card px-4 py-3";

  return (
    <form action={action} className="mx-auto max-w-2xl space-y-6 pb-24">
      {Object.entries(f).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={String(v)} />
      ))}

      <div>
        <h1 className="text-3xl font-black">Cotiza tu mudanza</h1>
        <ol className="mt-3 flex gap-1">
          {STEPS.map((s, i) => (
            <li key={s} className="flex-1">
              <button
                type="button"
                onClick={() => i < step && setStep(i)}
                className={`h-1.5 w-full rounded-full ${i <= step ? "bg-brand" : "bg-border"}`}
                aria-label={s}
              />
              <span className={`hidden text-xs font-bold sm:block ${i === step ? "text-foreground" : "text-muted"}`}>{s}</span>
            </li>
          ))}
        </ol>
      </div>

      {step === 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-extrabold">¿Qué necesitas mover?</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {services.map((s) => (
              <button
                key={s.slug}
                type="button"
                onClick={() => set("service_slug", s.slug)}
                className={`rounded-card border-2 p-4 text-left ${f.service_slug === s.slug ? "border-foreground bg-surface" : "border-border bg-background"}`}
              >
                <ServiceIcon slug={s.slug} className="h-7 w-7" />
                <span className="mt-1 block font-extrabold">{s.name}</span>
                <span className="block text-sm text-muted">{s.description}</span>
                <span className="mt-1 block text-sm font-bold">Desde {formatCLP(s.base_price)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-5">
          {(["origin", "dest"] as const).map((p) => (
            <fieldset key={p} className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <legend className="flex items-center gap-1.5 px-1 font-extrabold">
                <Icon name={p === "origin" ? "pin" : "flag"} className="h-4 w-4" strokeWidth={2.2} />
                {p === "origin" ? "Desde" : "Hacia"}
              </legend>
              <input
                className={input}
                placeholder="Dirección (calle y número)"
                value={f[`${p}_address`]}
                onChange={(e) => set(`${p}_address`, e.target.value)}
                autoComplete="street-address"
              />
              <div className="grid grid-cols-2 gap-3">
                <select className={input} value={f[`${p}_comuna`]} onChange={(e) => set(`${p}_comuna`, e.target.value)}>
                  <option value="">Comuna</option>
                  {COMUNAS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                  <option>Otra</option>
                </select>
                <label className="flex items-center gap-2">
                  <span className="text-sm font-bold">Piso</span>
                  <input
                    type="number"
                    min={1}
                    max={40}
                    className={input}
                    value={f[`${p}_floor`]}
                    onChange={(e) => set(`${p}_floor`, Math.max(1, Math.min(40, Number(e.target.value) || 1)))}
                  />
                </label>
              </div>
              {f[`${p}_floor`] > 1 && (
                <label className="flex items-center gap-2 text-sm font-bold">
                  <input type="checkbox" checked={f[`${p}_elevator`]} onChange={(e) => set(`${p}_elevator`, e.target.checked)} />
                  Hay ascensor donde caben muebles
                </label>
              )}
            </fieldset>
          ))}
          <fieldset className="space-y-2">
            <legend className="font-extrabold">Distancia aproximada</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DISTANCES.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => set("distance", d.key)}
                  className={`rounded-xl border-2 p-3 text-left ${f.distance === d.key ? "border-brand bg-brand/10" : "border-border bg-card"}`}
                >
                  <span className="block font-bold">{d.label}</span>
                  <span className="text-xs text-muted">{d.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <h2 className="text-xl font-extrabold">Extras</h2>
          <label className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
            <input type="checkbox" className="mt-1" checked={f.packing} onChange={(e) => set("packing", e.target.checked)} />
            <span>
              <span className="flex items-center gap-1.5 font-bold"><Icon name="box" className="h-4 w-4" strokeWidth={2.2} />Embalaje completo</span>
              <span className="text-sm text-muted">Llevamos cajas y materiales y embalamos todo por ti.</span>
            </span>
          </label>
          <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
            <span>
              <span className="flex items-center gap-1.5 font-bold"><Icon name="piano" className="h-4 w-4" strokeWidth={2.2} />Objetos muy pesados</span>
              <span className="text-sm text-muted">Piano, caja fuerte, máquinas de ejercicio…</span>
            </span>
            <span className="flex items-center gap-3">
              <button type="button" className="h-9 w-9 rounded-full border border-border text-lg font-black" onClick={() => set("heavy_items", Math.max(0, f.heavy_items - 1))}>−</button>
              <span className="w-4 text-center font-black">{f.heavy_items}</span>
              <button type="button" className="h-9 w-9 rounded-full border border-border text-lg font-black" onClick={() => set("heavy_items", Math.min(10, f.heavy_items + 1))}>+</button>
            </span>
          </div>
          <textarea
            className={input}
            rows={3}
            placeholder="¿Algo más que debamos saber? (cosas frágiles, estacionamiento, horarios del edificio…)"
            value={f.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <h2 className="text-xl font-extrabold">¿Cuándo te mudas?</h2>
          {days.length === 0 ? (
            <p className="text-muted">No hay horas disponibles por ahora. Escríbenos por WhatsApp.</p>
          ) : (
            <>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
                {days.map(([day, ss]) => {
                  const free = ss.some((s) => s.remaining > 0);
                  const [, m, d] = day.split("-");
                  const wd = formatDay(day).split(" ")[0];
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={!free}
                      onClick={() => setF((x) => ({ ...x, day, slot_time: "" }))}
                      className={`flex w-16 shrink-0 flex-col items-center rounded-2xl border-2 py-2 disabled:opacity-30 ${
                        f.day === day ? "border-brand bg-brand text-white" : "border-border bg-card"
                      }`}
                    >
                      <span className="text-xs font-bold capitalize">{wd.slice(0, 3)}</span>
                      <span className="text-xl font-black">{Number(d)}</span>
                      <span className="text-[10px]">{new Date(2000, Number(m) - 1).toLocaleDateString("es-CL", { month: "short" })}</span>
                    </button>
                  );
                })}
              </div>
              {f.day && (
                <div className="space-y-2">
                  <p className="font-bold first-letter:uppercase">{formatDay(f.day)}</p>
                  <div className="flex flex-wrap gap-2">
                    {daySlots.map((s) => (
                      <button
                        key={s.slot_time}
                        type="button"
                        disabled={s.remaining <= 0}
                        onClick={() => set("slot_time", s.slot_time)}
                        className={`rounded-full border-2 px-5 py-2 font-bold disabled:line-through disabled:opacity-40 ${
                          f.slot_time === s.slot_time ? "border-brand bg-brand text-white" : "border-border bg-card"
                        }`}
                      >
                        {s.slot_time} hrs
                      </button>
                    ))}
                  </div>
                  {isSaturday(f.day) && settings.weekend_surcharge_pct > 0 && (
                    <p className="text-xs text-muted">Los sábados tienen un recargo de {settings.weekend_surcharge_pct}%.</p>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {step === 4 && (
        <section className="space-y-4">
          <h2 className="text-xl font-extrabold">Tus datos</h2>
          <input className={input} placeholder="Nombre" value={f.contact_name} onChange={(e) => set("contact_name", e.target.value)} autoComplete="name" />
          <input className={input} type="email" placeholder="Correo" value={f.contact_email} onChange={(e) => set("contact_email", e.target.value)} autoComplete="email" />
          <input className={input} type="tel" placeholder="WhatsApp (+56 9 …)" value={f.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} autoComplete="tel" />

          <div className="rounded-2xl border border-border bg-card p-4 text-sm">
            <p className="flex items-center gap-2 font-extrabold">
              <ServiceIcon slug={service.slug} className="h-5 w-5" /> {service.name}
            </p>
            <p className="text-muted first-letter:uppercase">
              {formatDay(f.day)} · {f.slot_time} hrs
            </p>
            <p className="text-muted">
              {f.origin_comuna} → {f.dest_comuna}
            </p>
            <ul className="mt-3 space-y-1 border-t border-border pt-3">
              {quote.lines.map((l) => (
                <li key={l.label} className="flex justify-between">
                  <span>{l.label}</span>
                  <span>{formatCLP(l.amount)}</span>
                </li>
              ))}
              <li className="flex justify-between border-t border-border pt-2 text-base font-black">
                <span>Total estimado</span>
                <span>{formatCLP(quote.total)}</span>
              </li>
            </ul>
          </div>
          {state.error && <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{state.error}</p>}
          <button disabled={pending} className="w-full rounded-full bg-brand py-4 text-lg font-extrabold text-white disabled:opacity-60">
            {pending ? "Reservando…" : "Reservar mi hora"}
          </button>
          <p className="text-center text-xs text-muted">No pagas nada ahora. Te contactamos para confirmar.</p>
        </section>
      )}

      <div
        className="fixed inset-x-0 bottom-[60px] z-20 border-t border-border bg-card/95 backdrop-blur md:bottom-0"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs font-bold text-muted">Estimado</p>
            <p className="text-xl font-black">{formatCLP(quote.total)}</p>
          </div>
          <div className="flex gap-2">
            {step > 0 && (
              <button type="button" onClick={() => setStep(step - 1)} className="rounded-full border-2 border-border px-4 py-2.5 font-extrabold">
                Atrás
              </button>
            )}
            {step < STEPS.length - 1 && (
              <button
                type="button"
                disabled={!canNext}
                onClick={() => setStep(step + 1)}
                className="rounded-full bg-brand px-6 py-2.5 font-extrabold text-white disabled:opacity-40"
              >
                Siguiente
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
