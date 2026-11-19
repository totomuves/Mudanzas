"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { formatCLP } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { ProductImage } from "@/components/ProductImage";
import { removeFromCart, setCartQty, writeCart } from "@/lib/cart";
import { useCart } from "@/components/cart/useCart";
import { trackEvent } from "@/lib/marketing/track";
import { useShippingQuote } from "@/components/checkout/useShippingQuote";
import type { ShippingConfig } from "@/lib/data";
import { checkCreditCode, loadCart, startCartCheckout, type CartCheckoutState, type CartView, type CreditCheck } from "./actions";
import { formatCreditCode, formatCredits } from "@/lib/credits";

const noop = () => () => {};

export function CartScreen({ shipping: config }: { shipping: ShippingConfig }) {
  const shippingRates = config.rates;
  const auto = config.mode === "automatico";
  const items = useCart();
  const [view, setView] = useState<CartView | null>(null);
  const [loading, startLoading] = useTransition();
  const [state, action, pending] = useActionState<CartCheckoutState, FormData>(startCartCheckout, {});
  const [delivery, setDelivery] = useState<"retiro" | "despacho">("retiro");
  const [comuna, setComuna] = useState("");
  const [address, setAddress] = useState("");
  const [slot, setSlot] = useState("cualquiera");
  const [codeInput, setCodeInput] = useState("");
  const [credit, setCredit] = useState<Extract<CreditCheck, { ok: true }> | null>(null);
  const [creditError, setCreditError] = useState<string | null>(null);
  const [checkingCredit, startCheckingCredit] = useTransition();
  // El carrito vive en el navegador: en el servidor se muestra "cargando"
  const hydrated = useSyncExternalStore(noop, () => true, () => false);

  // Precios y disponibilidad siempre frescos desde la tienda
  const key = items.map((i) => i.id).sort().join(",");
  useEffect(() => {
    if (!key) return;
    startLoading(async () => setView(await loadCart(items)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, state.unavailable?.join(",")]);

  // Productos borrados de la tienda: se sacan del carrito
  useEffect(() => {
    if (!view || loading) return;
    const known = new Set(view.lines.map((l) => l.id));
    const gone = items.filter((i) => !known.has(i.id)).map((i) => i.id);
    if (gone.length && view.lines.length + gone.length === items.length) removeFromCart(gone);
  }, [view, loading, items]);

  const lines = useMemo(
    () =>
      (view?.lines ?? [])
        .map((l) => ({ ...l, qty: Math.min(items.find((i) => i.id === l.id)?.qty ?? 1, Math.max(1, l.available)) }))
        .filter((l) => items.some((i) => i.id === l.id)),
    [view, items],
  );
  const ready = lines.filter((l) => l.available > 0);
  const unavailable = lines.filter((l) => l.available <= 0);
  const groups = [...new Set(ready.map((l) => l.group))];
  const canShip = shippingRates.length > 0;
  const quoteItems = ready.map((l) => ({ id: l.id, qty: l.qty }));
  const quote = useShippingQuote({ enabled: auto && delivery === "despacho", items: quoteItems, comuna, address });
  const fixedRate = shippingRates.find((r) => r.comuna === comuna);
  // Precio del despacho: fijo por comuna (× entregas) o calculado con la dirección
  const shippingPrice: number | null = auto ? quote.total : fixedRate?.price != null ? fixedRate.price * groups.length : null;
  const rate = shippingPrice != null;
  const subtotal = ready.reduce((a, l) => a + l.unitPrice * l.qty, 0);
  const shipping = delivery === "despacho" && shippingPrice != null ? shippingPrice : 0;
  // Créditos: pagan productos de la tienda, nunca el despacho
  // (mismo cálculo y orden que la base de datos: por id de producto)
  const storeLines = ready.filter((l) => l.store && l.creditPrice).sort((a, b) => (a.id < b.id ? -1 : 1));
  const storeSubtotal = storeLines.reduce((a, l) => a + l.unitPrice * l.qty, 0);
  let discount = 0;
  let creditsSpent = 0;
  if (credit && delivery === "despacho") {
    let left = credit.balance;
    for (const l of storeLines) {
      if (left <= 0) break;
      const cost = l.creditPrice! * l.qty;
      const amount = l.unitPrice * l.qty;
      if (left >= cost) {
        discount += amount;
        creditsSpent += cost;
        left -= cost;
      } else {
        discount += Math.floor((amount * left) / cost);
        creditsSpent += left;
        left = 0;
      }
    }
  }
  const total = subtotal + shipping - discount;
  const count = ready.reduce((a, l) => a + l.qty, 0);
  const minShipping = config.minPrice;
  const dates = (view?.deliveries ?? []).filter((d) => groups.includes(d.group));
  const payload = JSON.stringify(ready.map((l) => ({ id: l.id, qty: l.qty })));

  if (!hydrated || (!view && items.length)) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-3xl font-black">Tu carrito</h1>
        <div className="h-24 animate-pulse rounded-2xl bg-surface" />
        <div className="h-24 animate-pulse rounded-2xl bg-surface" />
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="mx-auto max-w-md space-y-4 text-center">
        <Icon name="bag" className="mx-auto h-14 w-14 text-muted" strokeWidth={1.4} />
        <h1 className="text-2xl font-black">Tu carrito está vacío</h1>
        <p className="text-muted">Agrega los productos que te gusten y págalos todos juntos, en un solo pago.</p>
        <Link href="/descubrir" className="inline-block rounded-full bg-brand px-5 py-2.5 font-extrabold text-white">
          Descubrir productos
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-3xl font-black">Tu carrito</h1>
        <span className="text-sm font-semibold text-muted">
          {count} {count === 1 ? "producto" : "productos"}
        </span>
      </div>

      <ul className="divide-y divide-border border-y border-border">
        {lines.map((l) => {
          const out = l.available <= 0;
          return (
            <li key={l.id} className={`flex gap-4 py-4 ${out ? "opacity-60" : ""}`}>
              <Link href={`/producto/${l.id}`} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-surface">
                <ProductImage product={{ id: l.id, title: l.title, images: l.images }} category={{ slug: l.category_slug }} fit="contain" sizes="80px" />
              </Link>
              <div className="min-w-0 flex-1 space-y-1">
                <Link href={`/producto/${l.id}`} className="line-clamp-2 font-bold leading-snug">{l.title}</Link>
                {out ? (
                  <p className="text-sm font-bold text-pass">Ya no está disponible</p>
                ) : (
                  <p className="font-black">
                    {formatCLP(l.unitPrice * l.qty)}
                    {l.qty > 1 && <span className="ml-1 text-xs font-semibold text-muted">({formatCLP(l.unitPrice)} c/u)</span>}
                    {l.creditPrice ? <span className="block text-xs font-extrabold text-brand">o {formatCredits(l.creditPrice * l.qty)}</span> : null}
                  </p>
                )}
                <div className="flex items-center gap-3 pt-1">
                  {!out && l.available > 1 && (
                    <span className="flex items-center gap-2 rounded-full border border-border px-1">
                      <button type="button" aria-label="Menos" onClick={() => setCartQty(l.id, l.qty - 1)} disabled={l.qty <= 1} className="h-8 w-8 text-lg font-black disabled:opacity-30">−</button>
                      <span className="w-4 text-center text-sm font-black">{l.qty}</span>
                      <button type="button" aria-label="Más" onClick={() => setCartQty(l.id, Math.min(l.available, 10, l.qty + 1))} disabled={l.qty >= Math.min(10, l.available)} className="h-8 w-8 text-lg font-black disabled:opacity-30">+</button>
                    </span>
                  )}
                  <button type="button" onClick={() => removeFromCart(l.id)} className="flex items-center gap-1 text-sm font-semibold text-muted hover:text-foreground">
                    <Icon name="trash" className="h-4 w-4" />
                    Quitar
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {unavailable.length > 0 && (
        <button
          type="button"
          onClick={() => writeCart(items.filter((i) => !unavailable.some((u) => u.id === i.id)))}
          className="w-full rounded-full border-2 border-border py-3 text-sm font-extrabold"
        >
          Quitar los que ya no están
        </button>
      )}

      {ready.length > 0 && (
        <form
          action={action}
          onSubmit={() =>
            trackEvent("begin_checkout", {
              items: ready.map((l) => ({ id: l.id, name: l.title, price: l.unitPrice, quantity: l.qty })),
              value: total,
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="items" value={payload} />
          <h2 className="text-xl font-black">Tus datos</h2>
          <Field label="Nombre" name="name" autoComplete="name" required />
          <Field label="Correo" name="email" type="email" autoComplete="email" required />
          <Field label="Teléfono (WhatsApp)" name="phone" type="tel" autoComplete="tel" placeholder="+56 9 1234 5678" required />

          <fieldset className="space-y-2">
            <legend className="font-bold">¿Cómo lo recibes?</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["retiro", "Retiro", "Gratis", "warehouse"],
                  ["despacho", "Despacho", canShip ? `Desde ${formatCLP(minShipping)} según ${auto ? "distancia" : "comuna"}` : "Por ahora no disponible", "truck"],
                ] as const
              ).map(([value, label, hint, icon]) => {
                const disabled = value === "despacho" && !canShip;
                return (
                  <label
                    key={value}
                    className={`rounded-2xl border-2 p-3 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${delivery === value ? "border-foreground bg-surface" : "border-border bg-background"}`}
                  >
                    <input type="radio" name="delivery" value={value} checked={delivery === value} disabled={disabled} onChange={() => setDelivery(value)} className="sr-only" />
                    <Icon name={icon} className="mb-1 h-6 w-6" />
                    <span className="block font-bold">{label}</span>
                    <span className="text-xs text-muted">{hint}</span>
                  </label>
                );
              })}
            </div>
            {groups.length > 1 && (
              <p className="flex gap-2 rounded-xl bg-surface p-3 text-sm">
                <Icon name="box" className="h-5 w-5 shrink-0 text-muted" />
                Tus productos salen de {groups.length} bodegas distintas, así que llegan en {groups.length} entregas
                {delivery === "despacho" ? " y cada una tiene su despacho" : ""}.
              </p>
            )}
          </fieldset>

          {delivery === "despacho" && (
            <>
              <label className="block space-y-1">
                <span className="font-bold">Comuna</span>
                <select name="comuna" value={comuna} onChange={(e) => setComuna(e.target.value)} required className="w-full rounded-xl border border-border bg-card px-4 py-3">
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
              {dates.some((d) => d.dateLabel) && view?.slots && (
                <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
                  {dates.map((d, i) =>
                    d.dateLabel ? (
                      <p key={d.group} className="flex items-center gap-2 font-bold">
                        <Icon name="calendar" className="h-5 w-5 text-brand" />
                        {dates.length > 1 ? `Entrega ${i + 1}: llega el ${d.dateLabel}` : `Todo llega junto el ${d.dateLabel}`}
                      </p>
                    ) : null,
                  )}
                  <p className="text-sm text-muted">¿A qué hora te acomoda? El día anterior te avisamos una ventana más precisa.</p>
                  <div className="grid gap-2">
                    {view.slots.map((s) => (
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

          <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <p className="flex items-center gap-2 font-bold">
              <Icon name="gift" className="h-5 w-5 text-brand" />
              ¿Tienes créditos?
            </p>
            {credit ? (
              <div className="space-y-1 text-sm">
                <input type="hidden" name="credit_code" value={credit.code} />
                <p>
                  Código <b className="font-mono">{formatCreditCode(credit.code)}</b>: tienes <b>{formatCredits(credit.balance)}</b>, vigentes hasta el {credit.expires}.
                </p>
                {delivery !== "despacho" ? (
                  <p className="font-bold text-pass">Para usar tus créditos elige despacho. El despacho se paga aparte.</p>
                ) : storeSubtotal === 0 ? (
                  <p className="font-bold text-pass">Tus créditos sirven para productos de la tienda, y tu carrito no tiene ninguno.</p>
                ) : (
                  <p className="text-muted">Pagan productos de la tienda según su precio en créditos. El despacho se paga aparte, en pesos.</p>
                )}
                <button type="button" onClick={() => setCredit(null)} className="font-semibold text-muted underline-offset-4 hover:underline">Quitar código</button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    placeholder="ABCDE-FGHJK"
                    autoCapitalize="characters"
                    autoComplete="off"
                    aria-label="Código de créditos"
                    className="min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-3 font-mono uppercase"
                  />
                  <button
                    type="button"
                    disabled={checkingCredit || !codeInput.trim()}
                    onClick={() =>
                      startCheckingCredit(async () => {
                        setCreditError(null);
                        const r = await checkCreditCode(codeInput);
                        if (r.ok) {
                          setCredit(r);
                          setDelivery("despacho");
                        } else setCreditError(r.error);
                      })
                    }
                    className="rounded-xl border-2 border-foreground px-4 font-extrabold disabled:opacity-50"
                  >
                    {checkingCredit ? "…" : "Usar"}
                  </button>
                </div>
                {creditError && <p className="text-sm font-bold text-pass">{creditError}</p>}
              </>
            )}
          </section>

          <dl className="space-y-1 rounded-2xl border border-border bg-card p-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Productos ({count})</dt>
              <dd className="font-semibold">{formatCLP(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Despacho{groups.length > 1 && delivery === "despacho" ? ` (${groups.length} entregas)` : ""}</dt>
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
            {discount > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted">Pagado con {formatCredits(creditsSpent)}</dt>
                <dd className="font-semibold text-accent">−{formatCLP(discount)}</dd>
              </div>
            )}
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
            disabled={pending || loading || (delivery === "despacho" && !rate) || (credit != null && (delivery !== "despacho" || storeSubtotal === 0))}
            className="w-full rounded-full bg-[#009ee3] py-4 text-lg font-extrabold text-white shadow-lg disabled:opacity-60"
          >
            {pending ? "Conectando con Mercado Pago…" : `Pagar ${formatCLP(total)} con Mercado Pago`}
          </button>
          <p className="text-center text-xs text-muted">Un solo pago por todo. Te apartamos los productos 15 minutos mientras pagas.</p>
        </form>
      )}

      <Link href="/descubrir" className="block text-center text-sm font-bold text-muted underline-offset-4 hover:underline">
        Seguir descubriendo
      </Link>
    </div>
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
