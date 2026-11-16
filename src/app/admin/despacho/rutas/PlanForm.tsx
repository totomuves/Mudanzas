"use client";

import { useActionState } from "react";
import { Icon } from "@/components/Icon";
import { planDay, type PlanState } from "./actions";

export function PlanForm({ date, hasRoutes, disabled }: { date: string; hasRoutes: boolean; disabled?: boolean }) {
  const [state, action, pending] = useActionState<PlanState, FormData>(planDay, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="date" value={date} />
      <button
        disabled={pending || disabled}
        className="flex items-center gap-2 rounded-full bg-foreground px-6 py-3 font-extrabold text-background disabled:opacity-60"
      >
        <Icon name={pending ? "clock" : "sparkle"} className="h-5 w-5" />
        {pending ? "Calculando la mejor combinación…" : hasRoutes ? "Volver a planificar" : "Planificar rutas"}
      </button>
      {hasRoutes && !pending && (
        <p className="max-w-sm text-xs text-muted">Vuelve a calcular las rutas que no han salido. Las que van en camino no se tocan.</p>
      )}
      {state.error && <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{state.error}</p>}
      {state.ok && <p className="max-w-xl rounded-xl bg-accent/10 p-3 text-sm font-bold text-accent">{state.ok}</p>}
      {state.unassigned && state.unassigned.length > 0 && (
        <div className="max-w-xl rounded-xl bg-pass/10 p-3 text-sm">
          <p className="font-bold text-pass">Quedaron {state.unassigned.length} sin ruta:</p>
          <ul className="list-disc pl-5">
            {state.unassigned.map((u) => <li key={u.orderId}>{u.title}: {u.reason}</li>)}
          </ul>
        </div>
      )}
    </form>
  );
}
