import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { getCategories, getProduct } from "@/lib/data";
import { CONDITION_LABEL, isFlashActive, stockLabel } from "@/lib/format";
import { SetupNotice } from "@/components/SetupNotice";
import { PriceTag } from "@/components/PriceTag";
import { FlashCountdown } from "@/components/FlashCountdown";
import { Gallery } from "./Gallery";

export async function generateMetadata({ params }: PageProps<"/producto/[id]">): Promise<Metadata> {
  if (!hasSupabaseEnv()) return {};
  const product = await getProduct((await params).id);
  return product
    ? { title: product.title, description: product.description.slice(0, 150), openGraph: { images: product.images.slice(0, 1) } }
    : {};
}

export default async function ProductoPage({ params }: PageProps<"/producto/[id]">) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { id } = await params;
  const [product, categories] = await Promise.all([getProduct(id), getCategories()]);
  if (!product) notFound();
  const category = categories.find((c) => c.slug === product.category_slug);
  const sold = product.status === "sold";
  const available = product.available_units ?? product.quantity;
  const reservedByOther = !sold && available <= 0;

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Gallery product={product} category={category} />
      <div className="space-y-4">
        <Link href={`/catalogo?categoria=${product.category_slug}`} className="text-sm font-bold text-brand">
          {category?.emoji} {category?.name}
        </Link>
        <h1 className="text-3xl font-black">{product.title}</h1>
        {isFlashActive(product) && product.flash_until && <FlashCountdown until={product.flash_until} />}
        <PriceTag product={product} size="lg" />
        <div className="flex flex-wrap gap-2 text-sm font-bold">
          <span className="rounded-full bg-card px-3 py-1 ring-1 ring-border">{CONDITION_LABEL[product.condition]}</span>
          {product.comuna && <span className="rounded-full bg-card px-3 py-1 ring-1 ring-border">📍 {product.comuna}</span>}
          <span className="rounded-full bg-card px-3 py-1 ring-1 ring-border">{product.quantity === 1 ? "💎 " : "📦 "}{stockLabel(product)}</span>
        </div>
        {product.description && <p className="whitespace-pre-line text-muted">{product.description}</p>}

        {sold ? (
          <p className="rounded-2xl bg-border p-4 text-center font-extrabold">Este producto ya se vendió 😢</p>
        ) : (
          <div className="space-y-2">
            {reservedByOther ? (
              <p className="rounded-full bg-border py-4 text-center font-extrabold">Apartado por otra persona</p>
            ) : (
              <Link
                href={`/comprar/${product.id}`}
                className="block rounded-full bg-brand py-4 text-center text-lg font-extrabold text-white shadow-lg hover:bg-brand-dark"
              >
                Comprar
              </Link>
            )}
            {reservedByOther && (
              <p className="text-center text-xs text-muted">
                Alguien está pagando la última unidad. Si no completa el pago, se libera en minutos.
              </p>
            )}
          </div>
        )}
        <p className="text-xs text-muted">
          Pago seguro con Mercado Pago. Retiro en nuestra bodega o despacho coordinado.
        </p>
      </div>
    </div>
  );
}
