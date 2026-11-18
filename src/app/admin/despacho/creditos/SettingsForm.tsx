"use client";

import { useActionState } from "react";
import { saveCreditSettings, type CreditFormState } from "./actions";

export function CreditSettingsForm({ enabled, expiryDays }: { enabled: boolean; expiryDays: number }) {
  const [state, action, pending] = useActionState<CreditFormState, FormData>(saveCreditSettings, {});
  return (
    <form action={action} className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="font-extrabold">Ajustes</h2>
      <label className="flex cursor-pointer items-center gap-3 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="h-5 w-5 accent-[var(--brand)]" />
        <span><b>Se pueden usar en el carrito.</b> Apágalo para pausar todos los códigos sin borrarlos.</span>
      </label>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold">Vencen a los</span>
        <input name="expiry_days" type="number" min={1} max={3650} defaultValue={expiryDays} className="w-24 rounded-xl border border-border bg-background px-3 py-2" />
        <span className="font-bold">días</span>
        <span className="text-muted">desde que se hace el retiro.</span>
      </label>
      <button disabled={pending} className="rounded-full bg-brand px-5 py-2 font-extrabold text-white disabled:opacity-60">Guardar</button>
      {state.error && <p className="text-sm font-bold text-pass">{state.error}</p>}
      {state.ok && <p className="text-sm font-bold text-accent">{state.ok}</p>}
    </form>
  );
}
