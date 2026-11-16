import type { Metadata } from "next";
import Link from "next/link";
import { hasSupabaseEnv } from "@/lib/env";
import { requireSection } from "@/lib/admin";
import { formatCLP } from "@/lib/format";
import { formatDeliveryDate } from "@/lib/delivery";
import { SetupNotice } from "@/components/SetupNotice";
import type { Order, Product } from "@/lib/types";
import { StatusDot, type StatusTone } from "@/components/StatusDot";
import { Icon } from "@/components/Icon";
import { cancelManualOrder, markManualOrderPaid } from "./actions";

export const metadata: Metadata = { title: "Pedidos" };

const LABEL: Record<Order["status"], { tone: StatusTone; label: string }> = {
  paid: { tone: "ok", label: "Pagado" },
  pending: { tone: "warn", label: "Pendiente" },
  failed: { tone: "bad", label: "Fallido" },
  cancelled: { tone: "off", label: "Cancelado" },
  refunded: { tone: "off", label: "Reembolsado" },
};

const MANUAL_METHOD: Record<string, string> = { "manual:efectivo": "Efectivo", "manual:transferencia": "Transferencia" };

export default async function PedidosPage({ searchParams }: PageProps<"/admin/pedidos">) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const sp = await searchParams;
  const { supabase } = await requireSection("pedidos");
  const { data } = await supabase
    .from("orders")
    .select("*, products(title), sellers(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  const orders = (data ?? []) as (Order & { products: Pick<Product, "title"> | null; sellers: { name: string } | null })[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">Pedidos</h1>
        <Link href="/admin/pedidos/nuevo" className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2.5 font-extrabold text-white active:scale-95">
          <Icon name="plus" className="h-5 w-5" strokeWidth={2.2} /> Crear pedido
        </Link>
      </div>
      {sp.creado && (
        <p className="flex items-center gap-2 rounded-xl bg-surface p-3 text-sm font-bold">
          <Icon name="ok" className="h-5 w-5 text-brand" /> Pedido creado.
        </p>
      )}
      {orders.length === 0 ? (
        <p className="text-muted">Aún no hay pedidos.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="p-3">Fecha</th>
                <th className="p-3">Producto</th>
                <th className="p-3">Comprador</th>
                <th className="p-3">Entrega</th>
                <th className="p-3">Monto</th>
                <th className="p-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((o) => {
                const phone = (o.buyer_phone ?? "").replace(/\D/g, "");
                return (
                  <tr key={o.id} className={o.status === "paid" ? "" : "opacity-60"}>
                    <td className="whitespace-nowrap p-3">{new Date(o.created_at).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="p-3">
                      <Link href={`/admin/${o.product_id}`} className="font-bold hover:underline">
                        {o.products?.title ?? "—"}
                        {o.quantity > 1 ? ` × ${o.quantity}` : ""}
                      </Link>
                      <div className="text-xs text-muted">
                        {o.sellers ? `Vende: ${o.sellers.name}` : "MUVEO"}
                        {o.issue_at && !o.released_at && o.status === "paid" ? " · Con reclamo" : ""}
                      </div>
                    </td>
                    <td className="p-3">
                      <div>{o.buyer_name}</div>
                      <div className="text-xs text-muted">{o.buyer_email}</div>
                      {phone && (
                        <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" className="text-xs font-bold text-accent">
                          WhatsApp {o.buyer_phone}
                        </a>
                      )}
                    </td>
                    <td className="p-3">
                      {o.delivery === "retiro" ? "Retiro" : `Despacho: ${o.address}`}
                      {o.delivery === "despacho" && (
                        <div className="text-xs text-muted">
                          {o.delivered_at
                            ? `Entregado ${new Date(o.delivered_at).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })}`
                            : o.delivery_date
                              ? `Sale el ${formatDeliveryDate(o.delivery_date, { weekday: "short", day: "numeric", month: "short" })}`
                              : "Sin fecha de despacho"}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap p-3 font-bold">
                      {formatCLP(o.amount)}
                      {(o.shipping_amount ?? 0) > 0 && (
                        <div className="text-xs font-normal text-muted">incluye despacho {formatCLP(o.shipping_amount ?? 0)}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap p-3">
                      {o.mp_preference_id === "manual" && o.status === "pending" ? (
                        <div className="space-y-1.5">
                          <StatusDot tone="warn" label="Por pagar" />
                          <div className="flex flex-wrap gap-1.5">
                            <form action={markManualOrderPaid}>
                              <input type="hidden" name="id" value={o.id} />
                              <input type="hidden" name="method" value="transferencia" />
                              <button className="rounded-full bg-brand px-3 py-1 text-xs font-bold text-white">Pagado</button>
                            </form>
                            <form action={cancelManualOrder}>
                              <input type="hidden" name="id" value={o.id} />
                              <button className="rounded-full border border-border px-3 py-1 text-xs font-bold">Anular</button>
                            </form>
                          </div>
                        </div>
                      ) : (
                        <>
                          <StatusDot {...LABEL[o.status]} />
                          {o.mp_preference_id === "manual" && (
                            <div className="text-xs text-muted">Manual{o.mp_payment_id && MANUAL_METHOD[o.mp_payment_id] ? ` · ${MANUAL_METHOD[o.mp_payment_id]}` : ""}</div>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
