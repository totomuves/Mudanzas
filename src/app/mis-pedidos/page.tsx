import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { getUser } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/format";
import { SetupNotice } from "@/components/SetupNotice";
import { ProductImage } from "@/components/ProductImage";
import { StatusDot, type StatusTone } from "@/components/StatusDot";
import { Icon } from "@/components/Icon";
import type { Order, Product } from "@/lib/types";

export const metadata: Metadata = { title: "Mis pedidos" };

const LABEL: Record<Order["status"], { tone: StatusTone; label: string }> = {
  paid: { tone: "ok", label: "Pagado" },
  pending: { tone: "warn", label: "Pago en proceso" },
  failed: { tone: "bad", label: "Pago no completado" },
  cancelled: { tone: "off", label: "Cancelado" },
  refunded: { tone: "off", label: "Reembolsado" },
};

export default async function MisPedidosPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { supabase, user } = await getUser();
  if (!user || user.is_anonymous) redirect("/ingresar?next=/mis-pedidos");

  const { data } = await supabase
    .from("orders")
    .select("*, products(id, title, images, category_slug)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const orders = (data ?? []) as (Order & { products: Pick<Product, "id" | "title" | "images" | "category_slug"> | null })[];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-black">Mis pedidos</h1>
      {orders.length === 0 ? (
        <div className="space-y-3 rounded-card bg-surface p-8 text-center">
          <Icon name="bag" className="mx-auto h-12 w-12 text-muted" strokeWidth={1.4} />
          <p className="text-muted">Todavía no has comprado nada.</p>
          <Link href="/descubrir" className="inline-block rounded-full bg-brand px-5 py-2.5 font-extrabold text-white">
            Ir a descubrir
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/pedido/${o.id}`} className="flex items-center gap-4 py-4 hover:bg-surface/60">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface">
                  {o.products && (
                    <ProductImage product={o.products} category={{ slug: o.products.category_slug }} fit="contain" sizes="64px" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">
                    {o.products?.title ?? "Producto"}
                    {o.quantity > 1 ? ` × ${o.quantity}` : ""}
                  </p>
                  <p className="text-sm text-muted">
                    {new Date(o.created_at).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })} ·{" "}
                    {formatCLP(o.amount)}
                  </p>
                  <p className="text-xs font-bold">
                    <StatusDot {...(LABEL[o.status] ?? { tone: "off", label: o.status })} />
                  </p>
                </div>
                <Icon name="arrow" className="h-5 w-5 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
