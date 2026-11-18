"use client";

import { useActionState } from "react";
import { assignPickupCredit, type CreditFormState } from "@/app/admin/despacho/creditos/actions";

/** "Dar créditos" en un retiro: monto en pesos (0 los quita). */
export function CreditForm({ pickupId, amount }: { pickupId: string; amount: number | null }) {
  const [state, action, pending] = useActionState<CreditFormState, FormData>(assignPickupCredit, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="pickup_id" value={pickupId} />
      <span className="text-muted">Créditos $</span>
      <input
        name="amount"
        inputMode="numeric"
        defaultValue={amount ?? ""}
        placeholder="0"
        aria-label="Créditos en pesos"
        className="w-24 rounded-lg border border-border bg-background px-1.5 py-1"
      />
      <button disabled={pending} className="text-brand disabled:opacity-50">{amount ? "Cambiar" : "Dar"}</button>
      {state.error && <span className="text-pass">{state.error}</span>}
      {state.ok && <span className="text-accent">{state.ok}</span>}
    </form>
  );
}
