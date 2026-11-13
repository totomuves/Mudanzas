"use client";

import { useActionState } from "react";
import { setAdmin, type TeamState } from "./actions";

export function AddAdminForm() {
  const [state, action, pending] = useActionState<TeamState, FormData>(setAdmin, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="make" value="1" />
      <div className="flex gap-2">
        <input
          name="email"
          type="email"
          required
          placeholder="correo@ejemplo.cl"
          className="flex-1 rounded-xl border border-border bg-background px-4 py-3"
        />
        <button disabled={pending} className="rounded-xl bg-brand px-4 font-extrabold text-white disabled:opacity-60">
          {pending ? "…" : "Agregar"}
        </button>
      </div>
      <Message state={state} />
    </form>
  );
}

export function RemoveAdminButton({ email }: { email: string }) {
  const [state, action, pending] = useActionState<TeamState, FormData>(setAdmin, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`¿Quitar el permiso de admin a ${email}?`)) e.preventDefault();
      }}
      className="text-right"
    >
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="make" value="0" />
      <button disabled={pending} className="text-sm font-bold text-pass disabled:opacity-60">
        Quitar
      </button>
      {state.error && <p className="text-xs text-pass">{state.error}</p>}
    </form>
  );
}

function Message({ state }: { state: TeamState }) {
  if (state.ok) return <p className="rounded-xl bg-accent/15 p-3 text-sm font-bold text-accent">{state.ok}</p>;
  if (state.error) return <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{state.error}</p>;
  return null;
}
