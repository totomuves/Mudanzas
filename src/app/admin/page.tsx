import type { Metadata } from "next";
import Link from "next/link";
import { hasSupabaseEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/admin";
import { categoryMap, getCategories } from "@/lib/data";
import { currentPrice, formatCLP, isFlashActive } from "@/lib/format";
import { SetupNotice } from "@/components/SetupNotice";
import { ProductImage } from "@/components/ProductImage";
import type { Product } from "@/lib/types";
import { Icon } from "@/components/Icon";
import { StatusDot, type StatusTone } from "@/components/StatusDot";

export const metadata: Metadata = { title: "Admin" };

const STATUS_LABEL: Record<Product["status"], { tone: StatusTone; label: string }> = {
  available: { tone: "ok", label: "Disponible" },
  reserved: { tone: "warn", label: "Reservado" },
  sold: { tone: "info", label: "Agotado" },
  hidden: { tone: "off", label: "Oculto" },
};

export default async function AdminPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { supabase } = await requireAdmin();
  const [categories, { data }, { data: likes }] = await Promise.all([
    getCategories(),
    supabase.from("products").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("swipes").select("product_id").in("action", ["like", "superlike"]),
  ]);
  const cats = categoryMap(categories);
  const products = (data ?? []) as Product[];
  const likeCount: Record<string, number> = {};
  (likes ?? []).forEach((l: { product_id: string }) => (likeCount[l.product_id] = (likeCount[l.product_id] ?? 0) + 1));

  const stats = {
    disponibles: products.filter((p) => p.status === "available").length,
    vendidos: products.filter((p) => p.status === "sold").length,
    unidades: products.filter((p) => p.status === "available").reduce((s, p) => s + p.quantity, 0),
  };

  return (
    <div className="space-y-6">
      <Link
        href="/admin/nuevo"
        className="flex items-center justify-center gap-3 rounded-card bg-brand p-5 text-lg font-black text-white shadow-lg active:scale-95"
      >
        <Icon name="camera" className="h-7 w-7" strokeWidth={2} /> Fotografiar y subir producto
      </Link>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Disponibles" value={String(stats.disponibles)} />
        <Stat label="Agotados" value={String(stats.vendidos)} />
        <Stat label="Unidades en stock" value={String(stats.unidades)} />
      </div>
      {products.length === 0 ? (
        <p className="text-muted">
          Aún no hay productos. <Link href="/admin/nuevo" className="font-bold text-brand">Sube el primero</Link>.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {products.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/${p.id}`} className="flex items-center gap-3 p-3 hover:bg-background">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface">
                  <ProductImage product={p} category={cats[p.category_slug]} fit="contain" sizes="56px" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{p.title}</p>
                  <p className="text-xs text-muted">
                    {cats[p.category_slug]?.name} · {formatCLP(currentPrice(p))}
                    {isFlashActive(p) ? " · Relámpago" : ""} · {p.quantity} u. · {likeCount[p.id] ?? 0} me gusta
                  </p>
                </div>
                <span className="shrink-0 text-xs font-bold"><StatusDot {...STATUS_LABEL[p.status]} /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <p className="text-xl font-black">{value}</p>
    </div>
  );
}
