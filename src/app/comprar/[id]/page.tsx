import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { getCategories, getProduct } from "@/lib/data";
import { SetupNotice } from "@/components/SetupNotice";
import { ProductImage } from "@/components/ProductImage";
import { PriceTag } from "@/components/PriceTag";
import { currentPrice } from "@/lib/format";
import { CheckoutForm } from "./CheckoutForm";

export const metadata: Metadata = { title: "Comprar" };

export default async function ComprarPage({ params }: PageProps<"/comprar/[id]">) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { id } = await params;
  const [product, categories] = await Promise.all([getProduct(id), getCategories()]);
  if (!product) notFound();
  const category = categories.find((c) => c.slug === product.category_slug);

  if (product.status !== "available" || (product.available_units ?? product.quantity) <= 0) {
    return (
      <div className="mx-auto max-w-md space-y-4 text-center">
        <p className="text-5xl">😢</p>
        <h1 className="text-2xl font-black">Este producto ya no está disponible</h1>
        <Link href="/descubrir" className="inline-block rounded-full bg-brand px-5 py-2.5 font-extrabold text-white">
          Descubrir otros
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-3xl font-black">Finalizar compra</h1>
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-3">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl">
          <ProductImage product={product} category={category} sizes="80px" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-bold">{product.title}</p>
          <PriceTag product={product} />
        </div>
      </div>
      <CheckoutForm
        productId={product.id}
        unitPrice={currentPrice(product)}
        maxQuantity={Math.min(10, product.available_units ?? product.quantity)}
      />
    </div>
  );
}
