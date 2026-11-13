import type { Metadata } from "next";
import { requireSeller } from "@/lib/seller";
import { formatCLP } from "@/lib/format";
import { PAYOUT_LABEL, payoutState, sellerNet } from "@/lib/escrow";
import { StatusDot } from "@/components/StatusDot";
import type { Order, Product } from "@/lib/types";
import { markDelivered } from "./actions";

export const metadata: Metadata = { title: "Ventas y pagos" };

export default async function VendedorPedidosPage() {
  const { supabase } = await requireSeller();
  // Libera los pagos cuyo plazo de revisión ya venció
  await supabase.rpc("release_due_orders");
  const [{ data }, { data: settings }] = await Promise.all([
    supabase
      .from("orders")
      .select("*, products(title)")
      .in("status", ["paid", "refunded"])
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.rpc("marketplace_review_days"),
  ]);
  const orders = (data ?? []) as (Order & { products: Pick<Product, "title"> | null })[];
  const reviewDays = typeof settings === "number" ? settings : 3;

  const sum = (states: string[]) =>
    orders.filter((o) => states.includes(payoutState(o))).reduce((s, o) => s + sellerNet(o), 0);
  const totals = {
    retenido: sum(["por_entregar", "en_revision", "con_reclamo"]),
    porTransferir: sum(["liberado"]),
    transferido: sum(["transferido"]),
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Retenido" value={formatCLP(totals.retenido)} />
        <Stat label="Por transferirte" value={formatCLP(totals.porTransferir)} />
        <Stat label="Transferido" value={formatCLP(totals.transferido)} />
      </div>
      <p className="text-sm text-muted">
        Cuando entregues un pedido, márcalo como entregado. El comprador tiene {reviewDays} días para confirmar o reportar un
        problema; después el pago se libera y te lo transferimos menos la comisión.
      </p>

      {orders.length === 0 ? (
        <p className="text-muted">Aún no tienes ventas.</p>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => {
            const state = payoutState(o);
            const phone = (o.buyer_phone ?? "").replace(/\D/g, "");
            return (
              <li key={o.id} className="space-y-3 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold">
                      {o.products?.title ?? "Producto"}
                      {o.quantity > 1 ? ` × ${o.quantity}` : ""}
                    </p>
                    <p className="text-xs text-muted">
                      {new Date(o.paid_at ?? o.created_at).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-bold"><StatusDot {...PAYOUT_LABEL[state]} /></span>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                  <dt className="text-muted">Venta</dt>
                  <dd className="font-semibold">{formatCLP(o.amount)}</dd>
                  <dt className="text-muted">Para ti</dt>
                  <dd className="font-semibold">{formatCLP(sellerNet(o))}</dd>
                </dl>
                <div className="text-sm">
                  <p>
                    {o.buyer_name} · {o.delivery === "retiro" ? "Retira" : `Despacho a ${o.address}`}
                  </p>
                  {phone && (
                    <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" className="font-bold text-accent">
                      WhatsApp {o.buyer_phone}
                    </a>
                  )}
                </div>
                {state === "con_reclamo" && o.issue_text && (
                  <p className="rounded-xl bg-pass/10 p-3 text-sm">
                    <span className="font-bold">Reclamo del comprador:</span> {o.issue_text}. Nuestro equipo te va a contactar.
                  </p>
                )}
                {state === "en_revision" && o.release_at && (
                  <p className="text-xs text-muted">
                    Se libera el {new Date(o.release_at).toLocaleDateString("es-CL", { dateStyle: "medium" })} si no hay reclamos.
                  </p>
                )}
                {state === "por_entregar" && (
                  <form action={markDelivered}>
                    <input type="hidden" name="orderId" value={o.id} />
                    <button className="w-full rounded-full bg-foreground py-2.5 font-extrabold text-background">Marcar como entregado</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <p className="text-lg font-black">{value}</p>
    </div>
  );
}
