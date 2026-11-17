"use client";

import { useActionState, useState } from "react";
import { formatCLP } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { trackEvent } from "@/lib/marketing/track";
import { useShippingQuote } from "@/components/checkout/useShippingQuote";
import type { ShippingConfig } from "@/lib/data";
import { startCheckout, type CheckoutState } from "./actions";

export function CheckoutForm({
  productId,
  productTitle,
  unitPrice,
  maxQuantity,
  shipping: config,
  deliveryInfo,
}: {
  productId: string;
  productTitle?: string;
  unitPrice: number;
  maxQuantity: number;
  shipping: ShippingConfig;
  /** Fecha estimada y franjas horarias del despacho (null si aún no se configura el reparto). */
  deliveryInfo?: { dateLabel: string; slots: { value: string; label: string }[] } | null;
}) {
  const [state, action, pending] = useActionState<CheckoutState, FormData>(startCheckout, {});
  const [delivery, setDelivery] = useState<"retiro" | "despacho">("retiro");
  const [quantity, setQuantity] = useState(1);
  const [comuna, setComuna] = useState("");
  const [address, setAddress] = useState("");
  const [slot, setSlot] = useState("cualquiera");
  const shippingRates = config.rates;
  const auto = config.mode === "automatico";
  const canShip = shippingRates.length > 0;
  const quote = useShippingQuote({ enabled: auto && delivery === "despacho", items: [{ id: productId, qty: quantity }], comuna, address });
  const fixed = shippingRates.find((r) => r.comuna === comuna)?.price;
  const shippingPrice: number | null = auto ? quote.total : fixed ?? null;
  const rate = shippingPrice != null;
  const shipping = delivery === "despacho" && shippingPrice != null ? shippingPrice : 0;
  const subtotal = unitPrice * quantity;
  const total = subtotal + shipping;
  const minShipping = config.minPrice;

  return (
    <form
      action={action}
      onSubmit={() =>
        trackEvent("begin_checkout", {
          items: [{ id: productId, name: productTitle ?? "Producto", price: unitPrice, quantity }],
          value: total,
        })
      }
      className="space-y-4"
    >
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
                canShip ? `Desde ${formatCLP(minShipping)} según ${auto ? "distancia" : "comuna"}` : "Por ahora no disponible",
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
                  {r.price == null ? r.comuna : `${r.comuna} · ${r.price === 0 ? "Gratis" : formatCLP(r.price)}`}
                </option>
              ))}
            </select>
            <span className="block text-xs text-muted">
              {auto
                ? "El despacho se calcula según la distancia a tu dirección."
                : "¿No aparece tu comuna? Por ahora no despachamos ahí, pero puedes elegir retiro."}
            </span>
          </label>
          <Field label="Dirección (calle, número, depto)" name="address" autoComplete="street-address" required value={address} onChange={(e) => setAddress(e.target.value)} />
          <Field label="Indicaciones para llegar (opcional)" name="address_notes" placeholder="Ej: casa con reja verde, piso 3 sin ascensor" maxLength={200} />
          {deliveryInfo && (
            <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
              <p className="flex items-center gap-2 font-bold">
                <Icon name="calendar" className="h-5 w-5 text-brand" />
                Llega el {deliveryInfo.dateLabel}
              </p>
              <p className="text-sm text-muted">¿A qué hora te acomoda? El día anterior te avisamos una ventana más precisa.</p>
              <div className="grid gap-2">
                {deliveryInfo.slots.map((s) => (
                  <label key={s.value} className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2 text-sm ${slot === s.value ? "border-foreground bg-surface" : "border-border"}`}>
                    <input type="radio" name="delivery_slot" value={s.value} checked={slot === s.value} onChange={() => setSlot(s.value)} className="accent-[var(--brand)]" />
                    <Icon name="clock" className="h-4 w-4 text-muted" />
                    <span className="font-semibold">{s.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
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
            {delivery === "retiro"
              ? "Gratis (retiro)"
              : rate
                ? shipping === 0 ? "Gratis" : formatCLP(shipping)
                : auto && quote.loading
                  ? "Calculando…"
                  : auto && quote.error
                    ? "No disponible"
                    : "Elige tu comuna"}
          </dd>
        </div>
        <div className="flex justify-between border-t border-border pt-2 text-base">
          <dt className="font-black">Total</dt>
          <dd className="font-black">{formatCLP(total)}</dd>
        </div>
      </dl>

      {delivery === "despacho" && auto && quote.error && (
        <p className="rounded-xl bg-surface p-3 text-sm font-bold">{quote.error}</p>
      )}
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
