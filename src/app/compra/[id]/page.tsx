import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { getUser } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/format";
import { syncPayment } from "@/lib/payments";
import { SetupNotice } from "@/components/SetupNotice";
import { ProductImage } from "@/components/ProductImage";
import { Icon, type IconName } from "@/components/Icon";
import { formatDeliveryDate } from "@/lib/delivery";
import type { Checkout, Order, Product } from "@/lib/types";
import { ClearPurchased } from "./ClearPurchased";
import { TrackPurchase } from "@/components/marketing/TrackEvent";

export const metadata: Metadata = { title: "Tu compra" };

const STATUS: Record<Checkout["status"], { icon: IconName; color: string; title: string; text: string }> = {
  paid: { icon: "party", color: "text-accent", title: "¡Pago aprobado!", text: "Todo es tuyo. Te escribiremos por WhatsApp para coordinar la entrega." },
  pending: { icon: "clock", color: "text-muted", title: "Pago en proceso", text: "Estamos esperando la confirmación de Mercado Pago. Actualiza esta página en unos minutos." },
  failed: { icon: "sad", color: "text-pass", title: "El pago no se completó", text: "No se realizó ningún cobro. Tus productos siguen en el carrito para intentarlo de nuevo." },
  cancelled: { icon: "fail", color: "text-muted", title: "Compra cancelada", text: "No se realizó ningún cobro. Tus productos siguen en el carrito." },
  refunded: { icon: "undo", color: "text-muted", title: "Pago devuelto", text: "Te devolvimos el dinero. Puede tardar unos días en verse en tu medio de pago." },
};

type Row = Order & { products: Pick<Product, "id" | "title" | "images" | "category_slug"> | null };

export default async function CompraPage({ params, searchParams }: PageProps<"/compra/[id]">) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { supabase, user } = await getUser();
  if (!user) notFound();

  const load = () => supabase.from("checkouts").select("*").eq("id", id).maybeSingle();
  let { data } = await load();
  if (!data) notFound();

  // Al volver de Mercado Pago confirmamos el pago directamente (útil si el aviso aún no llega)
  const paymentId = typeof sp.payment_id === "string" ? sp.payment_id : null;
  if (data.status === "pending" && paymentId && /^\d+$/.test(paymentId)) {
    try {
      await syncPayment(paymentId);
      ({ data } = await load());
    } catch (e) {
      console.error("[compra] syncPayment", e);
    }
  }
  if (!data) notFound();
  const checkout = data as Checkout;

  const { data: rows } = await supabase
    .from("orders")
    .select("*, products(id, title, images, category_slug)")
    .eq("checkout_id", id)
    .order("created_at");
  const orders = (rows ?? []) as Row[];
  const s = STATUS[checkout.status];
  const dates = [...new Set(orders.map((o) => o.delivery_date).filter(Boolean) as string[])].sort();

  return (
    <div className="mx-auto max-w-md space-y-5">
      {checkout.status === "paid" && <ClearPurchased productIds={orders.map((o) => o.product_id)} />}
      {checkout.status === "paid" && (
        <TrackPurchase
          transactionId={checkout.id}
          value={checkout.amount}
          shipping={checkout.shipping_amount}
          items={orders.map((o) => ({
            id: o.product_id,
            name: o.products?.title ?? "Producto",
            quantity: o.quantity,
            price: Math.round((o.amount - (o.shipping_amount ?? 0)) / Math.max(1, o.quantity)),
          }))}
        />
      )}
      <div className="space-y-3 text-center">
        <div className={`animate-pop flex justify-center ${s.color}`}>
          <Icon name={s.icon} className="h-16 w-16" strokeWidth={1.4} />
        </div>
        <h1 className="text-3xl font-black">{s.title}</h1>
        <p className="text-muted">{s.text}</p>
      </div>

      <div className="space-y-1 rounded-2xl border border-border bg-card p-4 text-sm">
        <p className="font-bold">
          {checkout.items_count} {checkout.items_count === 1 ? "producto" : "productos"} · {formatCLP(checkout.amount)}
        </p>
        {checkout.shipping_amount > 0 && <p>Incluye despacho {formatCLP(checkout.shipping_amount)}</p>}
        {(checkout.credit_amount ?? 0) > 0 && <p>Usaste {checkout.credits_used ?? 0} {checkout.credits_used === 1 ? "crédito" : "créditos"} ({formatCLP(checkout.credit_amount ?? 0)} en productos)</p>}
        <p>Entrega: {checkout.delivery === "retiro" ? "Retiro (te contactamos para coordinar)" : `Despacho a ${checkout.address}`}</p>
        {checkout.status === "paid" && checkout.delivery === "despacho" && dates.length > 0 && (
          <p className="flex items-center gap-2 pt-1 font-bold">
            <Icon name="calendar" className="h-4 w-4 text-brand" />
            {dates.length === 1
              ? `Todo llega junto el ${formatDeliveryDate(dates[0])}`
              : `Llega en ${dates.length} entregas: ${dates.map((d) => formatDeliveryDate(d, { weekday: "long", day: "numeric" })).join(" y ")}`}
          </p>
        )}
        <p className="text-xs text-muted">Compra #{checkout.id.slice(0, 8)}</p>
      </div>

      <ul className="divide-y divide-border border-y border-border">
        {orders.map((o) => (
          <li key={o.id}>
            <Link href={`/pedido/${o.id}`} className="flex items-center gap-4 py-3 hover:bg-surface/60">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface">
                {o.products && <ProductImage product={o.products} category={{ slug: o.products.category_slug }} fit="contain" sizes="56px" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">
                  {o.products?.title ?? "Producto"}
                  {o.quantity > 1 ? ` × ${o.quantity}` : ""}
                </p>
                <p className="text-sm text-muted">{formatCLP(o.amount - (o.shipping_amount ?? 0))}</p>
              </div>
              {checkout.status === "paid" && (
                <span className="flex items-center gap-1 text-xs font-bold text-muted">
                  Seguimiento <Icon name="arrow" className="h-4 w-4" />
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        {(checkout.status === "failed" || checkout.status === "cancelled") && (
          <Link href="/carrito" className="rounded-full bg-brand py-3 text-center font-extrabold text-white">
            Volver al carrito
          </Link>
        )}
        <Link href="/descubrir" className="rounded-full border-2 border-border py-3 text-center font-extrabold">
          Seguir descubriendo
        </Link>
      </div>
    </div>
  );
}
