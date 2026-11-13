import type { Metadata } from "next";
import Link from "next/link";
import { getMySeller } from "@/lib/seller";
import { categoryMap, getCategories } from "@/lib/data";
import { currentPrice, formatCLP, isFlashActive } from "@/lib/format";
import { ProductImage } from "@/components/ProductImage";
import { StatusDot, type StatusTone } from "@/components/StatusDot";
import { Icon } from "@/components/Icon";
import { SellerForm } from "../vender/SellerForm";
import type { Product } from "@/lib/types";

export const metadata: Metadata = { title: "Mi tienda" };

const STATUS_LABEL: Record<Product["status"], { tone: StatusTone; label: string }> = {
  available: { tone: "ok", label: "Disponible" },
  reserved: { tone: "warn", label: "Reservado" },
  sold: { tone: "info", label: "Agotado" },
  hidden: { tone: "off", label: "Oculto" },
};

export default async function VendedorPage() {
  // El layout ya verificó que hay sesión y tienda
  const { supabase, seller } = await getMySeller();
  if (!seller) return null;

  if (seller.status !== "approved") {
    const msg = {
      pending: {
        title: "Estamos revisando tu solicitud",
        text: "Te avisaremos por correo o WhatsApp apenas esté aprobada. Mientras, puedes revisar tus datos.",
      },
      rejected: {
        title: "Tu solicitud no fue aprobada",
        text: seller.admin_note || "Revisa tus datos y vuelve a enviarla, o escríbenos para saber más.",
      },
      suspended: {
        title: "Tu tienda está suspendida",
        text: seller.admin_note || "Tus productos no se están mostrando. Escríbenos para revisarlo.",
      },
    }[seller.status];
    return (
      <div className="space-y-6">
        <div className="flex gap-3 rounded-card bg-surface p-5">
          <Icon name="clock" className="h-6 w-6 shrink-0" />
          <div>
            <h1 className="text-lg font-black">{msg.title}</h1>
            <p className="text-sm text-muted">{msg.text}</p>
          </div>
        </div>
        {seller.status !== "suspended" && <SellerForm seller={seller} />}
      </div>
    );
  }

  const [categories, { data }] = await Promise.all([
    getCategories(),
    supabase.from("products").select("*").eq("seller_id", seller.id).order("created_at", { ascending: false }).limit(300),
  ]);
  const cats = categoryMap(categories);
  const products = (data ?? []) as Product[];

  if (products.length === 0) {
    return (
      <Link
        href="/vendedor/nuevo"
        className="flex items-center justify-center gap-3 rounded-card bg-brand p-6 text-lg font-black text-white shadow-lg active:scale-95"
      >
        <Icon name="camera" className="h-7 w-7" strokeWidth={2} /> Sube tu primer producto
      </Link>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {products.map((p) => (
        <li key={p.id}>
          <Link href={`/vendedor/${p.id}`} className="flex items-center gap-3 p-3 hover:bg-background">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface">
              <ProductImage product={p} category={cats[p.category_slug]} fit="contain" sizes="56px" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{p.title}</p>
              <p className="text-xs text-muted">
                {cats[p.category_slug]?.name} · {formatCLP(currentPrice(p))}
                {isFlashActive(p) ? " · Relámpago" : ""} · {p.quantity} u.
              </p>
            </div>
            <span className="shrink-0 text-xs font-bold"><StatusDot {...STATUS_LABEL[p.status]} /></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
