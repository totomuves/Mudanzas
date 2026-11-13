import type { Metadata } from "next";
import Link from "next/link";
import { hasSupabaseEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/admin";
import { formatCLP } from "@/lib/format";
import { SetupNotice } from "@/components/SetupNotice";
import type { Order, Product } from "@/lib/types";
import { StatusDot, type StatusTone } from "@/components/StatusDot";

export const metadata: Metadata = { title: "Pedidos" };

const LABEL: Record<Order["status"], { tone: StatusTone; label: string }> = {
  paid: { tone: "ok", label: "Pagado" },
  pending: { tone: "warn", label: "Pendiente" },
  failed: { tone: "bad", label: "Fallido" },
  cancelled: { tone: "off", label: "Cancelado" },
  refunded: { tone: "off", label: "Reembolsado" },
};

export default async function PedidosPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("orders")
    .select("*, products(title), sellers(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  const orders = (data ?? []) as (Order & { products: Pick<Product, "title"> | null; sellers: { name: string } | null })[];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Pedidos</h1>
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
                        {o.sellers ? `Vende: ${o.sellers.name}` : "MÜVEO"}
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
                    <td className="p-3">{o.delivery === "retiro" ? "Retiro" : `Despacho: ${o.address}`}</td>
                    <td className="whitespace-nowrap p-3 font-bold">{formatCLP(o.amount)}</td>
                    <td className="whitespace-nowrap p-3"><StatusDot {...LABEL[o.status]} /></td>
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
