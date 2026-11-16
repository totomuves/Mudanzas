"use client";

import { useActionState, useMemo, useState } from "react";
import { formatCLP } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { createManualOrder, type NewOrderState } from "../actions";

type ProductOption = { id: string; title: string; price: number; units: number; seller: string | null };
type Option = { value: string; label: string };

const input = "w-full rounded-xl border border-border bg-card px-4 py-3";

export function NewOrderForm({
  products,
  shippingRates,
  dates,
  slots,
}: {
  products: ProductOption[];
  shippingRates: { comuna: string; price: number }[];
  /** Próximos días de reparto de MUVEO (vacío si el reparto no está configurado). */
  dates: Option[];
  slots: Option[];
}) {
  const [state, action, pending] = useActionState<NewOrderState, FormData>(createManualOrder, {});
  const [query, setQuery] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState("");
  const [delivery, setDelivery] = useState<"retiro" | "despacho">("retiro");
  const [comuna, setComuna] = useState("");
  const [payment, setPayment] = useState("transferencia");

  const product = products.find((p) => p.id === productId) ?? null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? products.filter((p) => p.title.toLowerCase().includes(q) || p.seller?.toLowerCase().includes(q)) : products).slice(0, 60);
  }, [products, query]);

  const listed = product ? product.price * quantity : 0;
  const subtotal = price ? parseInt(price.replace(/\D/g, ""), 10) || 0 : listed;
  const rate = shippingRates.find((r) => r.comuna === comuna);
  const shipping = delivery === "despacho" && rate ? rate.price : 0;
  const isMuveo = product ? !product.seller : true;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="quantity" value={quantity} />

      {/* Producto */}
      <section className="space-y-2">
        <h2 className="font-black">Producto</h2>
        {product ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-foreground bg-surface p-3">
            <div className="min-w-0">
              <p className="truncate font-bold">{product.title}</p>
              <p className="text-xs text-muted">
                {formatCLP(product.price)} · {product.units} disponible{product.units === 1 ? "" : "s"}
                {product.seller ? ` · Vende: ${product.seller}` : ""}
              </p>
            </div>
            <button type="button" onClick={() => { setProductId(""); setQuantity(1); setPrice(""); }} className="shrink-0 text-sm font-bold text-accent">
              Cambiar
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="relative block">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar producto"
                className={`${input} pl-9`}
                autoFocus
              />
            </label>
            <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-2xl border border-border bg-card">
              {filtered.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setProductId(p.id)} className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-surface">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{p.title}</span>
                      <span className="text-xs text-muted">
                        {p.units} disponible{p.units === 1 ? "" : "s"}
                        {p.seller ? ` · ${p.seller}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-bold">{formatCLP(p.price)}</span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && <li className="p-3 text-sm text-muted">No hay productos con ese nombre.</li>}
            </ul>
          </div>
        )}
        {product && product.units > 1 && (
          <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-3">
            <span className="font-bold">Cantidad</span>
            <span className="flex items-center gap-3">
              <button type="button" aria-label="Menos" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="h-9 w-9 rounded-full border border-border text-lg font-black">−</button>
              <span className="w-5 text-center font-black">{quantity}</span>
              <button type="button" aria-label="Más" onClick={() => setQuantity((q) => Math.min(product.units, q + 1))} className="h-9 w-9 rounded-full border border-border text-lg font-black">+</button>
            </span>
          </div>
        )}
        {product && (
          <label className="block space-y-1">
            <span className="text-sm font-bold">Precio acordado (opcional)</span>
            <input
              name="price"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
              placeholder={`${listed} (precio publicado)`}
              className={input}
            />
            <span className="block text-xs text-muted">Total por los productos, sin despacho. Déjalo vacío para usar el precio publicado.</span>
          </label>
        )}
      </section>

      {/* Comprador */}
      <section className="space-y-2">
        <h2 className="font-black">Comprador</h2>
        <input name="name" required placeholder="Nombre" autoComplete="off" className={input} />
        <input name="phone" type="tel" placeholder="Teléfono (WhatsApp)" autoComplete="off" className={input} />
        <input name="email" type="email" placeholder="Correo (opcional)" autoComplete="off" className={input} />
      </section>

      {/* Entrega */}
      <section className="space-y-2">
        <h2 className="font-black">Entrega</h2>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["retiro", "Retiro en bodega", "warehouse"],
              ["despacho", "Despacho", "truck"],
            ] as const
          ).map(([value, label, icon]) => (
            <label key={value} className={`cursor-pointer rounded-2xl border-2 p-3 ${delivery === value ? "border-foreground bg-surface" : "border-border bg-background"}`}>
              <input type="radio" name="delivery" value={value} checked={delivery === value} onChange={() => setDelivery(value)} className="sr-only" />
              <Icon name={icon} className="mb-1 h-6 w-6" />
              <span className="block font-bold">{label}</span>
            </label>
          ))}
        </div>
        {delivery === "despacho" && (
          <div className="space-y-2">
            <select name="comuna" value={comuna} onChange={(e) => setComuna(e.target.value)} required className={input}>
              <option value="">Comuna</option>
              {shippingRates.map((r) => (
                <option key={r.comuna} value={r.comuna}>
                  {r.comuna} · {r.price === 0 ? "Gratis" : formatCLP(r.price)}
                </option>
              ))}
            </select>
            {shippingRates.length === 0 && <p className="text-xs text-muted">No hay comunas con precio de despacho. Agrégalas en Despacho → Precios.</p>}
            <input name="address" required placeholder="Dirección (calle, número, depto)" autoComplete="off" className={input} />
            <input name="address_notes" maxLength={200} placeholder="Indicaciones (opcional)" autoComplete="off" className={input} />
            {isMuveo && dates.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                <select name="delivery_date" defaultValue="" className={input} aria-label="Día de entrega">
                  <option value="">Día: automático</option>
                  {dates.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
                <select name="delivery_slot" defaultValue="cualquiera" className={input} aria-label="Horario">
                  {slots.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-xs text-muted">El día de entrega se asigna solo, según el reparto.</p>
            )}
          </div>
        )}
      </section>

      {/* Pago */}
      <section className="space-y-2">
        <h2 className="font-black">Pago</h2>
        <div className="grid grid-cols-3 gap-2 text-sm">
          {(
            [
              ["transferencia", "Transferencia"],
              ["efectivo", "Efectivo"],
              ["pendiente", "Por pagar"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={`cursor-pointer rounded-xl border-2 px-2 py-2.5 text-center font-bold ${payment === value ? "border-foreground bg-surface" : "border-border"}`}>
              <input type="radio" name="payment" value={value} checked={payment === value} onChange={() => setPayment(value)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
        {payment === "pendiente" && <p className="text-xs text-muted">El producto queda apartado 3 días. Lo marcas como pagado desde la lista de pedidos.</p>}
      </section>

      <dl className="space-y-1 rounded-2xl border border-border bg-card p-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Productos</dt>
          <dd className="font-semibold">{formatCLP(subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Despacho</dt>
          <dd className="font-semibold">{delivery === "retiro" ? "Retiro" : rate ? formatCLP(rate.price) : "Elige la comuna"}</dd>
        </div>
        <div className="flex justify-between border-t border-border pt-2 text-base">
          <dt className="font-black">Total</dt>
          <dd className="font-black">{formatCLP(subtotal + shipping)}</dd>
        </div>
      </dl>

      {state.error && <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{state.error}</p>}
      <button
        type="submit"
        disabled={pending || !product}
        className="w-full rounded-full bg-brand py-3.5 font-extrabold text-white disabled:opacity-50"
      >
        {pending ? "Creando…" : "Crear pedido"}
      </button>
    </form>
  );
}
