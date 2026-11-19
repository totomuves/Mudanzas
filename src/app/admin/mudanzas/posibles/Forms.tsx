"use client";

import { useActionState } from "react";
import { TEAM_STATUS } from "@/lib/moving-leads";
import { saveLead, saveLeadSettings, type FormState } from "./actions";

const input = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm";

function Msg({ state }: { state: FormState }) {
  if (state.error) return <p className="text-sm font-bold text-pass">{state.error}</p>;
  if (state.ok) return <p className="text-sm font-bold text-accent">{state.ok}</p>;
  return null;
}

export function LeadForm({ userId, status, note }: { userId: string; status: string; note: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveLead, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <select name="team_status" defaultValue={status} className="rounded-full border border-border bg-background px-3 py-2 text-sm font-bold">
        {TEAM_STATUS.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      <input name="team_note" defaultValue={note ?? ""} maxLength={500} placeholder="Nota del equipo" className={`${input} min-w-0 flex-1 rounded-full`} />
      <button disabled={pending} className="rounded-full bg-foreground px-4 py-2 text-sm font-bold text-background disabled:opacity-50">
        {pending ? "Guardando…" : "Guardar"}
      </button>
      <Msg state={state} />
    </form>
  );
}

export type LeadSettings = {
  enabled: boolean;
  threshold: number;
  window_days: number;
  ask_again_no_days: number;
  ask_again_later_days: number;
  reminder_offer: string;
};

function Num({ name, label, hint, value, min, max }: { name: string; label: string; hint: string; value: number; min: number; max: number }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-bold">{label}</span>
      <input name={name} type="number" min={min} max={max} defaultValue={value} className={input} />
      <span className="block text-xs text-muted">{hint}</span>
    </label>
  );
}

export function SettingsForm({ settings }: { settings: LeadSettings }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveLeadSettings, {});
  return (
    <form action={action} className="space-y-4">
      <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="h-4 w-4" />
        Preguntar &quot;¿Te cambias de casa?&quot; en la web
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Num name="threshold" label="Puntaje para preguntar" hint="De 1 a 100. Más alto = se pregunta a menos gente, pero más segura." value={settings.threshold} min={1} max={100} />
        <Num name="window_days" label="Días que se miran" hint="Solo cuenta lo que hizo en estos últimos días." value={settings.window_days} min={3} max={180} />
        <Num name="ask_again_no_days" label="Si dice No, volver a preguntar en (días)" hint="Para no molestar." value={settings.ask_again_no_days} min={7} max={730} />
        <Num name="ask_again_later_days" label="Si dice Más adelante, volver a preguntar en (días)" hint="Si cierra sin responder, se le pregunta en 3 días." value={settings.ask_again_later_days} min={1} max={180} />
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-bold">Oferta del último consejo (opcional)</span>
        <input name="reminder_offer" defaultValue={settings.reminder_offer} maxLength={200} placeholder="Ej.: Reserva esta semana y te damos un 5% de descuento." className={input} />
        <span className="block text-xs text-muted">Aparece en el consejo 4 (recordatorio para reservar). El descuento lo aplica el equipo al confirmar la mudanza.</span>
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-full bg-foreground px-5 py-2.5 text-sm font-bold text-background disabled:opacity-50">
          {pending ? "Guardando…" : "Guardar ajustes"}
        </button>
        <Msg state={state} />
      </div>
    </form>
  );
}
