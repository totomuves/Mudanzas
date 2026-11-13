"use client";

import { useActionState } from "react";
import type { MarketplaceSettings, Seller } from "@/lib/types";
import { markPaidOut, resolveIssue, updateSeller, updateSettings, type AdminSellerState } from "./actions";

const input = "w-full rounded-xl border border-border bg-background px-3 py-2";

function Message({ state }: { state: AdminSellerState }) {
  if (state.ok) return <p className="text-sm font-bold text-accent">{state.ok}</p>;
  if (state.error) return <p className="text-sm font-bold text-pass">{state.error}</p>;
  return null;
}

export function SettingsForm({ settings }: { settings: MarketplaceSettings | null }) {
  const [state, action, pending] = useActionState<AdminSellerState, FormData>(updateSettings, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="space-y-1 text-sm font-bold">
        Comisión general (%)
        <input name="commission_pct" inputMode="decimal" defaultValue={settings?.commission_pct ?? 10} className={input} />
      </label>
      <label className="space-y-1 text-sm font-bold">
        Días para revisar la compra
        <input name="review_days" type="number" min={1} max={30} defaultValue={settings?.review_days ?? 3} className={input} />
      </label>
      <button disabled={pending} className="rounded-xl bg-brand px-4 py-2.5 font-extrabold text-white disabled:opacity-60">
        Guardar
      </button>
      <div className="sm:col-span-3"><Message state={state} /></div>
    </form>
  );
}

export function SellerAdminForm({ seller }: { seller: Seller }) {
  const [state, action, pending] = useActionState<AdminSellerState, FormData>(updateSeller, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="sellerId" value={seller.id} />
      <label className="space-y-1 text-sm font-bold">
        Estado
        <select name="status" defaultValue={seller.status} className={input}>
          <option value="pending">En revisión</option>
          <option value="approved">Aprobada</option>
          <option value="rejected">Rechazada</option>
          <option value="suspended">Suspendida</option>
        </select>
      </label>
      <label className="space-y-1 text-sm font-bold">
        Comisión propia (%)
        <input name="commission_pct" inputMode="decimal" defaultValue={seller.commission_pct ?? ""} placeholder="General" className={input} />
      </label>
      <button disabled={pending} className="rounded-xl bg-foreground px-4 py-2.5 font-extrabold text-background disabled:opacity-60">
        Guardar
      </button>
      <label className="space-y-1 text-sm font-bold sm:col-span-3">
        Nota para el vendedor (se le muestra si la rechazas o suspendes)
        <input name="admin_note" maxLength={500} defaultValue={seller.admin_note ?? ""} className={input} />
      </label>
      <div className="sm:col-span-3"><Message state={state} /></div>
    </form>
  );
}

export function PayoutButton({ sellerId, label }: { sellerId: string; label: string }) {
  const [state, action, pending] = useActionState<AdminSellerState, FormData>(markPaidOut, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("¿Ya hiciste la transferencia? Se marcarán como pagadas todas las ventas liberadas.")) e.preventDefault();
      }}
      className="space-y-1"
    >
      <input type="hidden" name="sellerId" value={sellerId} />
      <button disabled={pending} className="w-full rounded-xl bg-accent px-4 py-2.5 font-extrabold text-white disabled:opacity-60">
        {label}
      </button>
      <Message state={state} />
    </form>
  );
}

export function IssueButtons({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState<AdminSellerState, FormData>(resolveIssue, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="flex gap-2">
        <button name="decision" value="release" disabled={pending} className="flex-1 rounded-xl border-2 border-foreground py-2 text-sm font-extrabold disabled:opacity-60">
          Liberar al vendedor
        </button>
        <button
          name="decision"
          value="refund"
          disabled={pending}
          onClick={(e) => {
            if (!window.confirm("¿Devolver todo el dinero al comprador por Mercado Pago?")) e.preventDefault();
          }}
          className="flex-1 rounded-xl bg-pass py-2 text-sm font-extrabold text-white disabled:opacity-60"
        >
          Devolver dinero
        </button>
      </div>
      <Message state={state} />
    </form>
  );
}
