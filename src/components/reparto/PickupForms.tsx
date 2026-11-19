"use client";

import { useActionState, useEffect, useRef } from "react";
import { Icon } from "@/components/Icon";
import { planMyPickups, savePickup, type PickupFormState, type PickupPlanState } from "@/app/reparto/retiros/actions";

type Option = { value: string; label: string };
const input = "w-full rounded-xl border border-border bg-card px-4 py-3";

/** Agregar un retiro: quién regala, dónde, qué y cuánto ocupa. */
export function PickupForm({ date, comunas, slots, sizes }: { date: string; comunas: readonly string[]; slots: Option[]; sizes: Option[] }) {
  const [state, action, pending] = useActionState<PickupFormState, FormData>(savePickup, {});
  const ref = useRef<HTMLFormElement>(null);
  // Tras guardar, deja el formulario listo para la siguiente dirección
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok, state.at]);

  return (
    <form ref={ref} action={action} className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 font-black"><Icon name="plus" className="h-5 w-5" />Agregar retiro</h2>
      <input type="hidden" name="pickup_date" value={date} />
      <div className="grid grid-cols-2 gap-2">
        <input name="contact_name" required placeholder="Quién regala" autoComplete="off" className={input} />
        <input name="contact_phone" type="tel" placeholder="Teléfono" autoComplete="off" className={input} />
      </div>
      <input name="address" required placeholder="Dirección (calle y número)" autoComplete="off" className={input} />
      <div className="grid grid-cols-2 gap-2">
        <select name="comuna" defaultValue="" className={input} aria-label="Comuna">
          <option value="">Comuna</option>
          {comunas.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select name="slot" defaultValue="cualquiera" className={input} aria-label="Horario">
          {slots.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      <input name="address_notes" maxLength={200} placeholder="Indicaciones (piso, ascensor, portería…)" autoComplete="off" className={input} />
      <textarea name="items" required rows={2} maxLength={300} placeholder="Qué se retira (ej: sofá 3 cuerpos, 2 sillas y una lámpara)" className={input} />
      <select name="size" defaultValue="" className={input} aria-label="Tamaño">
        <option value="">Tamaño de lo más grande: mediano</option>
        {sizes.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input name="volume_m3" inputMode="decimal" placeholder="Volumen total m³ (opcional)" className={input} />
        <input name="weight_kg" inputMode="decimal" placeholder="Peso total kg (opcional)" className={input} />
      </div>
      <p className="text-xs text-muted">Con el volumen el sistema calcula mejor cuánto cabe en cada vehículo. Si no lo sabes, usa el tamaño.</p>
      {state.error && <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{state.error}</p>}
      {state.ok && <p className="rounded-xl bg-accent/10 p-3 text-sm font-bold text-accent">{state.ok}</p>}
      <button disabled={pending} className="w-full rounded-full bg-brand py-3 font-extrabold text-white disabled:opacity-60">
        {pending ? "Guardando…" : "Agregar retiro"}
      </button>
    </form>
  );
}

/** El chofer arma su ruta de retiros (los que aún no van en otra ruta). */
export function PlanMineForm({ date, pending, vehicles, suggestedId = null }: { date: string; pending: number; vehicles: { id: string; label: string }[]; suggestedId?: string | null }) {
  const suggested = vehicles.find((v) => v.id === suggestedId);
  const [state, action, working] = useActionState<PickupPlanState, FormData>(planMyPickups, {});
  return (
    <form action={action} className="space-y-2 rounded-2xl border-2 border-foreground p-4">
      <input type="hidden" name="date" value={date} />
      <p className="font-extrabold">Ruta inteligente de retiros</p>
      <p className="text-sm text-muted">
        {pending ? `${pending} retiro${pending === 1 ? "" : "s"} sin ruta. ` : "Todos los retiros tienen ruta. "}
        Ordena las paradas por cercanía, tráfico y horario, sin pasarse de la capacidad del vehículo.
      </p>
      {vehicles.length > 1 && (
        <select name="vehicle_id" defaultValue="" className={input} aria-label="Vehículo">
          <option value="">Vehículo: el mío{suggested ? ` (si no tengo, ${suggested.label.split(" · ")[0]})` : " (o el sugerido)"}</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}{v.id === suggestedId ? " · sugerido" : ""}</option>)}
        </select>
      )}
      <button disabled={working || vehicles.length === 0} className="flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-3 font-extrabold text-background disabled:opacity-60">
        <Icon name={working ? "clock" : "sparkle"} className="h-5 w-5" />
        {working ? "Calculando la mejor ruta…" : "Armar mi ruta de retiros"}
      </button>
      {suggested && vehicles.length > 1 && (
        <p className="text-xs text-muted">Sugerido: <b>{suggested.label}</b>, porque le cabe todo y su parking queda más a mano (menos km y gasto).</p>
      )}
      {vehicles.length === 0 && <p className="text-xs text-muted">Falta agregar vehículos en Despacho → Vehículos y horarios.</p>}
      {state.error && <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{state.error}</p>}
      {state.ok && <p className="rounded-xl bg-accent/10 p-3 text-sm font-bold text-accent">{state.ok}</p>}
      {state.unassigned && state.unassigned.length > 0 && (
        <ul className="list-disc rounded-xl bg-pass/10 p-3 pl-7 text-sm">
          {state.unassigned.map((u) => <li key={u.orderId}>{u.title}: {u.reason}</li>)}
        </ul>
      )}
    </form>
  );
}
