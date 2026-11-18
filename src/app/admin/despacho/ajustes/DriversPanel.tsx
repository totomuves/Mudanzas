"use client";

import { useActionState } from "react";
import type { Driver } from "@/components/reparto/SetupForms";
import type { FormState } from "@/lib/routing/manage";
import { addDriver } from "./actions";

const input = "w-full rounded-xl border border-border bg-background px-4 py-3";

/** Choferes del equipo: quiénes hay, quiénes están invitados y un formulario para agregar más. */
export function DriversPanel({ drivers, invited, canInvite }: { drivers: Driver[]; invited: string[]; canInvite: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addDriver, {});
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-lg font-extrabold">Choferes</h2>
        <p className="text-sm text-muted">
          Aquí aparecen los administradores totales y las personas del equipo con la sección <b>Reparto (chofer)</b>.
          Cada chofer ve solo sus rutas en el celular, navega y registra las entregas con firma y foto.
        </p>
      </div>
      <ul className="space-y-1 text-sm">
        {drivers.map((d) => (
          <li key={d.id}>
            <b>{d.name}</b> <span className="text-muted">({d.email})</span>
          </li>
        ))}
        {invited.map((email) => (
          <li key={email} className="text-muted">
            {email} · invitado, aparecerá para asignarle un vehículo cuando entre a la app con ese correo
          </li>
        ))}
      </ul>
      {canInvite ? (
        <form action={action} className="space-y-2">
          <label className="block text-sm font-bold" htmlFor="driver-email">Agregar chofer</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id="driver-email" name="email" type="email" required placeholder="correo del chofer" className={input} />
            <button disabled={pending} className="shrink-0 rounded-xl bg-brand px-5 py-3 font-extrabold text-white disabled:opacity-60">
              {pending ? "Agregando…" : "Agregar"}
            </button>
          </div>
          {state.error && <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{state.error}</p>}
          {state.ok && <p className="rounded-xl bg-accent/10 p-3 text-sm font-bold text-accent">{state.ok}</p>}
        </form>
      ) : (
        <p className="text-sm text-muted">Para agregar choferes, pídele a un administrador total que los invite.</p>
      )}
    </div>
  );
}
