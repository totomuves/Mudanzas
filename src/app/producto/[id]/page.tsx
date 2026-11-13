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
import { TrackView } from "./TrackView";

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
    <div className="-mt-4 grid gap-6 md:mt-0 md:grid-cols-2 md:gap-10">
      <TrackView productId={product.id} />
      <Gallery product={product} category={category} />
      <div className="space-y-4">
        <div className="space-y-1">
          <Link href={`/catalogo?categoria=${product.category_slug}`} className="text-sm font-semibold text-muted underline-offset-4 hover:underline">
            {category?.name}
          </Link>
          <h1 className="text-2xl font-black leading-tight md:text-3xl">{product.title}</h1>
        </div>
        {isFlashActive(product) && product.flash_until && <FlashCountdown until={product.flash_until} />}
        <PriceTag product={product} size="lg" />
        {product.description && <p className="whitespace-pre-line text-muted">{product.description}</p>}

        {sold ? (
          <p className="rounded-full bg-surface p-4 text-center font-extrabold">Este producto ya se vendió</p>
        ) : (
          <div className="space-y-2">
            {reservedByOther ? (
              <p className="rounded-full bg-surface py-4 text-center font-extrabold">Apartado por otra persona</p>
            ) : (
              <Link
                href={`/comprar/${product.id}`}
                className="block rounded-full bg-brand py-4 text-center text-lg font-extrabold text-white transition hover:bg-brand-dark"
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
        <dl className="divide-y divide-border border-y border-border text-sm">
          <Row label="Estado" value={CONDITION_LABEL[product.condition]} />
          {product.comuna && <Row label="Ubicación" value={product.comuna} />}
          <Row label="Disponibles" value={stockLabel(product)} />
          <Row label="Entrega" value="Retiro en bodega o despacho coordinado" />
          <Row label="Pago" value="Seguro con Mercado Pago" />
        </dl>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}
