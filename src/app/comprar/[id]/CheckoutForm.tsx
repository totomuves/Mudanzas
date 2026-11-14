"use client";

import { useActionState, useState } from "react";
import { formatCLP } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { startCheckout, type CheckoutState } from "./actions";

export function CheckoutForm({
  productId,
  unitPrice,
  maxQuantity,
  shippingRates,
}: {
  productId: string;
  unitPrice: number;
  maxQuantity: number;
  shippingRates: { comuna: string; price: number }[];
}) {
  const [state, action, pending] = useActionState<CheckoutState, FormData>(startCheckout, {});
  const [delivery, setDelivery] = useState<"retiro" | "despacho">("retiro");
  const [quantity, setQuantity] = useState(1);
  const [comuna, setComuna] = useState("");
  const canShip = shippingRates.length > 0;
  const rate = shippingRates.find((r) => r.comuna === comuna);
  const shipping = delivery === "despacho" && rate ? rate.price : 0;
  const subtotal = unitPrice * quantity;
  const total = subtotal + shipping;
  const minShipping = canShip ? Math.min(...shippingRates.map((r) => r.price)) : 0;

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
              ["retiro", "Retiro en bodega", "Gratis", "warehouse"],
              [
                "despacho",
                "Despacho",
                canShip ? `Desde ${formatCLP(minShipping)} según comuna` : "Por ahora no disponible",
                "truck",
              ],
            ] as const
          ).map(([value, label, hint, icon]) => {
            const disabled = value === "despacho" && !canShip;
            return (
            <label
              key={value}
              className={`rounded-2xl border-2 p-3 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${delivery === value ? "border-foreground bg-surface" : "border-border bg-background"}`}
            >
              <input
                type="radio"
                name="delivery"
                value={value}
                checked={delivery === value}
                disabled={disabled}
                onChange={() => setDelivery(value)}
                className="sr-only"
              />
              <Icon name={icon} className="mb-1 h-6 w-6" />
              <span className="block font-bold">{label}</span>
              <span className="text-xs text-muted">{hint}</span>
            </label>
            );
          })}
        </div>
      </fieldset>
      {delivery === "despacho" && (
        <>
          <label className="block space-y-1">
            <span className="font-bold">Comuna</span>
            <select
              name="comuna"
              value={comuna}
              onChange={(e) => setComuna(e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-card px-4 py-3"
            >
              <option value="">Elige tu comuna</option>
              {shippingRates.map((r) => (
                <option key={r.comuna} value={r.comuna}>
                  {r.comuna} · {r.price === 0 ? "Gratis" : formatCLP(r.price)}
                </option>
              ))}
            </select>
            <span className="block text-xs text-muted">
              ¿No aparece tu comuna? Por ahora no despachamos ahí, pero puedes elegir retiro.
            </span>
          </label>
          <Field label="Dirección (calle, número, depto)" name="address" autoComplete="street-address" required />
        </>
      )}

      <dl className="space-y-1 rounded-2xl border border-border bg-card p-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Productos</dt>
          <dd className="font-semibold">{formatCLP(subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Despacho</dt>
          <dd className="font-semibold">
            {delivery === "retiro" ? "Gratis (retiro)" : rate ? (rate.price === 0 ? "Gratis" : formatCLP(rate.price)) : "Elige tu comuna"}
          </dd>
        </div>
        <div className="flex justify-between border-t border-border pt-2 text-base">
          <dt className="font-black">Total</dt>
          <dd className="font-black">{formatCLP(total)}</dd>
        </div>
      </dl>

      {state.error && <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{state.error}</p>}

      <button
        disabled={pending || (delivery === "despacho" && !rate)}
        className="w-full rounded-full bg-[#009ee3] py-4 text-lg font-extrabold text-white shadow-lg disabled:opacity-60"
      >
        {pending ? "Conectando con Mercado Pago…" : `Pagar ${formatCLP(total)} con Mercado Pago`}
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
