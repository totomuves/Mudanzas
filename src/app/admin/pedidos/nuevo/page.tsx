import type { Metadata } from "next";
import Link from "next/link";
import { hasSupabaseEnv } from "@/lib/env";
import { requireSection } from "@/lib/admin";
import { getShippingRates } from "@/lib/data";
import { currentPrice } from "@/lib/format";
import { slotLabel, upcomingDeliveryDates, formatDeliveryDate, type DeliverySlot } from "@/lib/delivery";
import { createAdminClient } from "@/lib/supabase/admin";
import { readDeliverySettings } from "@/lib/routing/planner";
import { SetupNotice } from "@/components/SetupNotice";
import { Icon } from "@/components/Icon";
import type { Product } from "@/lib/types";
import { NewOrderForm } from "./NewOrderForm";

export const metadata: Metadata = { title: "Crear pedido" };

export default async function NuevoPedidoPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireSection("pedidos");
  const db = createAdminClient();

  const [{ data }, shippingRates, { settings }] = await Promise.all([
    db
      .from("products")
      .select("id, title, price, flash_price, flash_until, quantity, available_units, seller_id, sellers(name)")
      .eq("status", "available")
      .order("created_at", { ascending: false })
      .limit(1000),
    getShippingRates(),
    readDeliverySettings(db, null).catch(() => ({ settings: null })),
  ]);
  const rows = (data ?? []) as unknown as (Pick<Product, "id" | "title" | "price" | "flash_price" | "flash_until" | "quantity" | "seller_id"> & {
    available_units: number | null;
    sellers: { name: string } | null;
  })[];
  const products = rows
    .map((p) => ({
      id: p.id,
      title: p.title,
      price: currentPrice(p),
      units: p.available_units ?? p.quantity,
      seller: p.sellers?.name ?? null,
    }))
    .filter((p) => p.units > 0);

  const dates = settings
    ? upcomingDeliveryDates(settings, new Date(), 6).map((d) => ({ value: d, label: formatDeliveryDate(d, { weekday: "long", day: "numeric", month: "short" }) }))
    : [];
  const slots = settings
    ? (["cualquiera", "manana", "tarde"] as DeliverySlot[]).map((v) => ({ value: v, label: slotLabel(v, settings) }))
    : [];

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link href="/admin/pedidos" className="inline-flex items-center gap-1 text-sm font-bold text-muted hover:text-foreground">
        <Icon name="back" className="h-4 w-4" /> Pedidos
      </Link>
      <div>
        <h1 className="text-2xl font-black">Crear pedido</h1>
        <p className="text-sm text-muted">Para ventas por WhatsApp, teléfono o en bodega. Descuenta el stock igual que una compra en la tienda.</p>
      </div>
      {products.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-4 text-muted">No hay productos con stock disponible.</p>
      ) : (
        <NewOrderForm products={products} shippingRates={shippingRates} dates={dates} slots={slots} />
      )}
    </div>
  );
}
