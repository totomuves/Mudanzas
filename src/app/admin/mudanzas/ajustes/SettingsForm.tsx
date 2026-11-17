"use client";

import { useActionState, useState } from "react";
import { Icon } from "@/components/Icon";
import { DISTANCES, type MovingSettings } from "@/lib/moving";
import { saveMovingSettings, type SettingsState } from "./actions";

const input = "w-full rounded-xl border border-border bg-background px-3 py-2";
const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-bold">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

function Money({ name, value, prefix = "$" }: { name: string; value: number; prefix?: string }) {
  return (
    <div className="flex items-center rounded-xl border border-border bg-background pl-3">
      <span className="text-muted">{prefix}</span>
      <input name={name} inputMode="numeric" defaultValue={value} required className="w-full bg-transparent px-2 py-2 outline-none" />
    </div>
  );
}

function Pct({ name, value }: { name: string; value: number }) {
  return (
    <div className="flex items-center rounded-xl border border-border bg-background pr-3">
      <input name={name} inputMode="numeric" defaultValue={value} required className="w-full bg-transparent px-3 py-2 outline-none" />
      <span className="text-muted">%</span>
    </div>
  );
}

export function SettingsForm({ settings }: { settings: MovingSettings }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveMovingSettings, {});
  const [slots, setSlots] = useState<string[]>(settings.slot_times);

  return (
    <form action={action} className="space-y-6">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-6">
        <h2 className="flex items-center gap-2 text-lg font-black"><Icon name="chat" className="h-5 w-5" />Contacto</h2>
        <Field label="WhatsApp" hint="Solo números, con 56 adelante. Ej.: 56945331035. Se usa en la página de mudanzas y en la confirmación de reserva.">
          <input name="whatsapp" inputMode="tel" defaultValue={settings.whatsapp ?? ""} placeholder="56912345678" className={input} />
        </Field>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-6">
        <h2 className="flex items-center gap-2 text-lg font-black"><Icon name="clock" className="h-5 w-5" />Horarios y cupos</h2>
        <div className="space-y-2">
          <p className="text-sm font-bold">Bloques horarios (hora de inicio)</p>
          <ul className="flex flex-wrap gap-2">
            {slots.map((t, i) => (
              <li key={i} className="flex items-center gap-1 rounded-full border border-border bg-background pl-3">
                <input
                  type="time"
                  name="slot_times"
                  value={t}
                  onChange={(e) => setSlots((s) => s.map((x, j) => (j === i ? e.target.value : x)))}
                  className="bg-transparent py-1.5 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setSlots((s) => s.filter((_, j) => j !== i))}
                  disabled={slots.length === 1}
                  aria-label="Quitar bloque"
                  className="rounded-full p-2 text-pass disabled:opacity-30"
                >
                  <Icon name="x" className="h-4 w-4" strokeWidth={2.4} />
                </button>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => setSlots((s) => [...s, "12:00"])} className="rounded-full border border-dashed border-foreground px-4 py-2 text-sm font-bold">
                + Agregar bloque
              </button>
            </li>
          </ul>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Mudanzas por bloque" hint="Cuántos equipos o vehículos tienes. Con una sola Sprinter, pon 1.">
            <input name="crews_per_slot" type="number" min={1} max={50} defaultValue={settings.crews_per_slot} required className={input} />
          </Field>
          <Field label="Anticipación mínima (horas)" hint="Ej.: 24 = no se puede reservar para dentro de menos de un día.">
            <input name="min_notice_hours" type="number" min={0} defaultValue={settings.min_notice_hours} required className={input} />
          </Field>
          <Field label="Reservar hasta (días)" hint="Cuántos días hacia adelante se muestra el calendario.">
            <input name="booking_days_ahead" type="number" min={1} max={365} defaultValue={settings.booking_days_ahead} required className={input} />
          </Field>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-bold">Días que no trabajas</p>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => (
              <label key={d} className="flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm font-bold has-[:checked]:border-foreground has-[:checked]:bg-foreground has-[:checked]:text-background">
                <input type="checkbox" name="closed_weekdays" value={i} defaultChecked={settings.closed_weekdays.includes(i)} className="sr-only" />
                {d}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted">Los marcados en negro quedan cerrados. Para feriados o vacaciones usa “Días sin atención” en la Agenda.</p>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-6">
        <h2 className="flex items-center gap-2 text-lg font-black"><Icon name="calculator" className="h-5 w-5" />Recargos</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cada piso por escalera (desde el 2º)" hint="Si hay ascensor no se cobra.">
            <Money name="price_per_floor" value={settings.price_per_floor} />
          </Field>
          <Field label="Objeto pesado (piano, caja fuerte…)" hint="Por cada objeto.">
            <Money name="heavy_item_price" value={settings.heavy_item_price} />
          </Field>
          <Field label="Embalaje completo" hint="Porcentaje del precio del servicio.">
            <Pct name="packing_pct" value={settings.packing_pct} />
          </Field>
          <Field label="Recargo sábado" hint="Pon 0 para no cobrar recargo.">
            <Pct name="weekend_surcharge_pct" value={settings.weekend_surcharge_pct} />
          </Field>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-bold">Recargo por distancia</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DISTANCES.map((d) => (
              <Field key={d.key} label={d.label} hint={d.hint}>
                <Money name={`dist_${d.key}`} value={settings.distance_prices[d.key] ?? 0} />
              </Field>
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="rounded-full bg-brand px-6 py-3 font-extrabold text-white disabled:opacity-60">
          {pending ? "Guardando…" : "Guardar ajustes"}
        </button>
        {state.error && <p className="text-sm font-bold text-pass">{state.error}</p>}
        {state.ok && <p className="text-sm font-bold text-accent">{state.ok}</p>}
      </div>
    </form>
  );
}
