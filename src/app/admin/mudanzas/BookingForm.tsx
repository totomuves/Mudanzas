"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { COMUNAS } from "@/lib/comunas";
import { formatCLP } from "@/lib/format";
import { BOOKING_STATUS, computeQuote, DISTANCES, type DistanceKey, type MovingSettings, type ServiceType } from "@/lib/moving";
import { saveAdminBooking, type AdminBookingState } from "./booking-actions";

const input = "w-full rounded-xl border border-border bg-background px-3 py-2";

export type BookingValues = {
  id?: string;
  service_slug: string;
  day: string;
  slot_time: string;
  origin_address: string;
  origin_comuna: string;
  origin_floor: number;
  origin_elevator: boolean;
  dest_address: string;
  dest_comuna: string;
  dest_floor: number;
  dest_elevator: boolean;
  distance: string;
  packing: boolean;
  heavy_items: number;
  notes: string | null;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string;
  estimated_price: number | null;
  status: string;
};

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm font-bold">
      <span>{text}</span>
      {children}
    </label>
  );
}

/** Formulario del admin para crear o editar una mudanza. Sugiere el precio con las mismas reglas del cotizador. */
export function BookingForm({
  values,
  services,
  settings,
}: {
  values: BookingValues;
  services: ServiceType[];
  settings: MovingSettings | null;
}) {
  const [state, action, pending] = useActionState<AdminBookingState, FormData>(saveAdminBooking, {});
  const [v, setV] = useState(values);
  const [price, setPrice] = useState(values.estimated_price === null ? "" : String(values.estimated_price));
  const set = <K extends keyof BookingValues>(k: K, val: BookingValues[K]) => setV((d) => ({ ...d, [k]: val }));
  const text = (k: keyof BookingValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((d) => ({ ...d, [k]: e.target.value }));

  const service = services.find((s) => s.slug === v.service_slug);
  const suggested = useMemo(() => {
    if (!service || !settings) return null;
    return computeQuote(
      {
        service,
        distance: v.distance as DistanceKey,
        originFloor: Number(v.origin_floor) || 1,
        originElevator: v.origin_elevator,
        destFloor: Number(v.dest_floor) || 1,
        destElevator: v.dest_elevator,
        packing: v.packing,
        heavyItems: Number(v.heavy_items) || 0,
        day: v.day || null,
      },
      settings,
    ).total;
  }, [service, settings, v]);

  // Horas: los bloques configurados + la hora actual de la mudanza si es otra
  const slotOptions = Array.from(new Set([...(settings?.slot_times ?? []), ...(values.slot_time ? [values.slot_time] : [])])).sort();

  return (
    <form action={action} className="space-y-6">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <datalist id="comunas">
        {COMUNAS.map((c) => <option key={c} value={c} />)}
      </datalist>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-6">
        <h2 className="text-lg font-black">Servicio y fecha</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Label text="Servicio">
            <select name="service_slug" value={v.service_slug} onChange={text("service_slug")} required className={`${input} font-normal`}>
              <option value="">Elegir…</option>
              {services.map((s) => (
                <option key={s.slug} value={s.slug}>{s.name}{s.active ? "" : " (oculto)"}</option>
              ))}
            </select>
          </Label>
          <Label text="Día">
            <input type="date" name="day" value={v.day} onChange={text("day")} required className={`${input} font-normal`} />
          </Label>
          <Label text="Hora">
            <input type="time" name="slot_time" list="bloques" value={v.slot_time} onChange={text("slot_time")} required className={`${input} font-normal`} />
            <datalist id="bloques">
              {slotOptions.map((t) => <option key={t} value={t} />)}
            </datalist>
          </Label>
          <Label text="Estado">
            <select name="status" value={v.status} onChange={text("status")} className={`${input} font-normal`}>
              {Object.entries(BOOKING_STATUS).map(([k, s]) => (
                <option key={k} value={k}>{s.label}</option>
              ))}
            </select>
          </Label>
        </div>
        {slotOptions.length > 0 && (
          <p className="text-xs text-muted">
            Bloques configurados: {settings?.slot_times.join(", ")}. Puedes poner otra hora; desde el admin no se revisan cupos.
          </p>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {(["origin", "dest"] as const).map((side) => (
          <div key={side} className="space-y-3 rounded-2xl border border-border bg-card p-4 md:p-6">
            <h2 className="text-lg font-black">{side === "origin" ? "Origen" : "Destino"}</h2>
            <Label text="Dirección">
              <input name={`${side}_address`} value={v[`${side}_address`]} onChange={text(`${side}_address`)} required placeholder="Calle 123, depto 45" className={`${input} font-normal`} />
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <Label text="Comuna">
                <input name={`${side}_comuna`} list="comunas" value={v[`${side}_comuna`]} onChange={text(`${side}_comuna`)} required className={`${input} font-normal`} />
              </Label>
              <Label text="Piso">
                <input name={`${side}_floor`} type="number" min={1} max={40} value={v[`${side}_floor`]} onChange={(e) => set(`${side}_floor`, Number(e.target.value))} className={`${input} font-normal`} />
              </Label>
            </div>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" name={`${side}_elevator`} checked={v[`${side}_elevator`]} onChange={(e) => set(`${side}_elevator`, e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
              Tiene ascensor
            </label>
          </div>
        ))}
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-6">
        <h2 className="text-lg font-black">Detalles</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Label text="Distancia">
            <select name="distance" value={v.distance} onChange={text("distance")} className={`${input} font-normal`}>
              {DISTANCES.map((d) => (
                <option key={d.key} value={d.key}>{d.label} ({d.hint})</option>
              ))}
            </select>
          </Label>
          <Label text="Objetos pesados">
            <input name="heavy_items" type="number" min={0} max={10} value={v.heavy_items} onChange={(e) => set("heavy_items", Number(e.target.value))} className={`${input} font-normal`} />
          </Label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-bold">
            <input type="checkbox" name="packing" checked={v.packing} onChange={(e) => set("packing", e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
            Embalaje completo
          </label>
        </div>
        <Label text="Notas">
          <textarea name="notes" rows={3} value={v.notes ?? ""} onChange={text("notes")} placeholder="Inventario, accesos, estacionamiento…" className={`${input} font-normal`} />
        </Label>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-6">
        <h2 className="text-lg font-black">Cliente</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Label text="Nombre">
            <input name="contact_name" value={v.contact_name} onChange={text("contact_name")} required className={`${input} font-normal`} />
          </Label>
          <Label text="Teléfono">
            <input name="contact_phone" inputMode="tel" value={v.contact_phone} onChange={text("contact_phone")} required placeholder="+56 9 1234 5678" className={`${input} font-normal`} />
          </Label>
          <Label text="Correo (opcional)">
            <input name="contact_email" type="email" value={v.contact_email ?? ""} onChange={text("contact_email")} className={`${input} font-normal`} />
          </Label>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl bg-brand-soft p-4 md:p-6">
        <h2 className="text-lg font-black">Precio</h2>
        <div className="flex flex-wrap items-end gap-3">
          <Label text="Precio acordado">
            <div className="flex items-center rounded-xl border border-border bg-background pl-3">
              <span className="text-muted">$</span>
              <input name="estimated_price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} required className="w-40 bg-transparent px-2 py-2 font-normal outline-none" />
            </div>
          </Label>
          {suggested !== null && (
            <div className="pb-1 text-sm">
              <p className="text-muted">Según el cotizador: <b className="text-foreground">{formatCLP(suggested)}</b></p>
              {String(suggested) !== price.replace(/\D/g, "") && (
                <button type="button" onClick={() => setPrice(String(suggested))} className="font-bold text-brand underline underline-offset-4">
                  Usar este precio
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="rounded-full bg-brand px-6 py-3 font-extrabold text-white disabled:opacity-60">
          {pending ? "Guardando…" : v.id ? "Guardar cambios" : "Crear mudanza"}
        </button>
        <Link href="/admin/mudanzas" className="rounded-full px-4 py-3 font-bold text-muted hover:text-foreground">Cancelar</Link>
        {state.error && <p className="text-sm font-bold text-pass">{state.error}</p>}
      </div>
    </form>
  );
}
