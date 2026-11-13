import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { getUser } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/format";
import { syncPayment } from "@/lib/payments";
import { SetupNotice } from "@/components/SetupNotice";
import type { Order, Product } from "@/lib/types";

export const metadata: Metadata = { title: "Tu pedido" };

const STATUS = {
  paid: { icon: "🎉", title: "¡Pago aprobado!", text: "Es tuyo. Te escribiremos por WhatsApp para coordinar la entrega." },
  pending: { icon: "⏳", title: "Pago en proceso", text: "Estamos esperando la confirmación de Mercado Pago. Actualiza esta página en unos minutos." },
  failed: { icon: "😕", title: "El pago no se completó", text: "No se realizó ningún cobro. Puedes intentarlo de nuevo si el producto sigue disponible." },
  cancelled: { icon: "🚫", title: "Pedido cancelado", text: "No se realizó ningún cobro." },
} as const;

export default async function PedidoPage({ params, searchParams }: PageProps<"/pedido/[id]">) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { supabase, user } = await getUser();
  if (!user) notFound();

  const load = () => supabase.from("orders").select("*, products(*)").eq("id", id).maybeSingle();
  let { data } = await load();
  if (!data) notFound();

  // Al volver de Mercado Pago confirmamos el pago directamente (útil en local, donde no llegan webhooks)
  const paymentId = typeof sp.payment_id === "string" ? sp.payment_id : null;
  if (data.status === "pending" && paymentId && /^\d+$/.test(paymentId)) {
    try {
      await syncPayment(paymentId);
      ({ data } = await load());
    } catch (e) {
      console.error("[pedido] syncPayment", e);
    }
  }
  if (!data) notFound();

  const order = data as Order & { products: Product | null };
  const s = STATUS[order.status];

  return (
    <div className="mx-auto max-w-md space-y-5 text-center">
      <div className="animate-pop text-7xl">{s.icon}</div>
      <h1 className="text-3xl font-black">{s.title}</h1>
      <p className="text-muted">{s.text}</p>
      <div className="rounded-2xl border border-border bg-card p-4 text-left text-sm">
        <p className="font-bold">{order.products?.title}</p>
        <p>Total: {formatCLP(order.amount)}</p>
        <p>Entrega: {order.delivery === "retiro" ? "Retiro en bodega" : `Despacho a ${order.address}`}</p>
        <p className="text-xs text-muted">Pedido #{order.id.slice(0, 8)}</p>
      </div>
      <div className="flex flex-col gap-2">
        {(order.status === "failed" || order.status === "cancelled") && order.products?.status === "available" && (
          <Link href={`/comprar/${order.product_id}`} className="rounded-full bg-brand py-3 font-extrabold text-white">
            Intentar de nuevo
          </Link>
        )}
        <Link href="/descubrir" className="rounded-full border-2 border-border py-3 font-extrabold">
          Seguir descubriendo
        </Link>
      </div>
    </div>
  );
}
