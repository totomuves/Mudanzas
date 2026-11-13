"use client";

import { useActionState, useState } from "react";
import { formatCLP } from "@/lib/format";
import { startCheckout, type CheckoutState } from "./actions";

export function CheckoutForm({
  productId,
  unitPrice,
  maxQuantity,
}: {
  productId: string;
  unitPrice: number;
  maxQuantity: number;
}) {
  const [state, action, pending] = useActionState<CheckoutState, FormData>(startCheckout, {});
  const [delivery, setDelivery] = useState<"retiro" | "despacho">("retiro");
  const [quantity, setQuantity] = useState(1);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="quantity" value={quantity} />
      {maxQuantity > 1 && (
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
          <span className="font-bold">Cantidad</span>
          <span className="flex items-center gap-3">
            <button type="button" aria-label="Menos" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="h-9 w-9 rounded-full border border-border text-lg font-black">−</button>
            <span className="w-5 text-center font-black">{quantity}</span>
            <button type="button" aria-label="Más" onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))} className="h-9 w-9 rounded-full border border-border text-lg font-black">+</button>
          </span>
        </div>
      )}
      <Field label="Nombre" name="name" autoComplete="name" required />
      <Field label="Correo" name="email" type="email" autoComplete="email" required />
      <Field label="Teléfono (WhatsApp)" name="phone" type="tel" autoComplete="tel" placeholder="+56 9 1234 5678" required />

      <fieldset className="space-y-2">
        <legend className="font-bold">¿Cómo lo recibes?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["retiro", "🏬 Retiro en bodega", "Gratis"],
              ["despacho", "🚚 Despacho", "Se coordina y cotiza aparte"],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className={`cursor-pointer rounded-2xl border-2 p-3 ${delivery === value ? "border-brand bg-brand/10" : "border-border bg-card"}`}
            >
              <input
                type="radio"
                name="delivery"
                value={value}
                checked={delivery === value}
                onChange={() => setDelivery(value)}
                className="sr-only"
              />
              <span className="block font-bold">{label}</span>
              <span className="text-xs text-muted">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {delivery === "despacho" && <Field label="Dirección y comuna" name="address" autoComplete="street-address" required />}

      {state.error && <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{state.error}</p>}

      <button
        disabled={pending}
        className="w-full rounded-full bg-[#009ee3] py-4 text-lg font-extrabold text-white shadow-lg disabled:opacity-60"
      >
        {pending ? "Conectando con Mercado Pago…" : `Pagar ${formatCLP(unitPrice * quantity)} con Mercado Pago`}
      </button>
      <p className="text-center text-xs text-muted">
        Te lo apartamos 15 minutos mientras completas el pago.
      </p>
    </form>
  );
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block space-y-1">
      <span className="font-bold">{label}</span>
      <input {...props} className="w-full rounded-xl border border-border bg-card px-4 py-3" />
    </label>
  );
}
