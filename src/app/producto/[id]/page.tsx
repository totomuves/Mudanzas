import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { getCategories, getProduct } from "@/lib/data";
import { CONDITION_LABEL, currentPrice, formatCLP, isFlashActive, stockLabel } from "@/lib/format";
import { SetupNotice } from "@/components/SetupNotice";
import { PriceTag } from "@/components/PriceTag";
import { FlashCountdown } from "@/components/FlashCountdown";
import { Gallery } from "./Gallery";
import { TrackView } from "./TrackView";
import { AddToCart } from "@/components/cart/AddToCart";
import { JsonLd } from "@/components/marketing/JsonLd";
import { TrackViewItem } from "@/components/marketing/TrackEvent";
import { brand } from "@/brand";
import { siteUrl } from "@/lib/env";
import type { Product } from "@/lib/types";
import { getCreditValue } from "@/lib/credits-server";
import { creditPrice } from "@/lib/credits";

const SCHEMA_CONDITION: Record<Product["condition"], string> = {
  nuevo: "https://schema.org/NewCondition",
  como_nuevo: "https://schema.org/UsedCondition",
  buen_estado: "https://schema.org/UsedCondition",
  con_detalles: "https://schema.org/UsedCondition",
};

function summary(product: Product) {
  const text = (product.description || "").replace(/\s+/g, " ").trim();
  const base = text || `${product.title} a precio bajísimo en ${brand.name}.`;
  return base.length > 155 ? `${base.slice(0, 152).trimEnd()}…` : base;
}

export async function generateMetadata({ params }: PageProps<"/producto/[id]">): Promise<Metadata> {
  if (!hasSupabaseEnv()) return {};
  const product = await getProduct((await params).id);
  if (!product) return {};
  const url = `/producto/${product.id}`;
  const price = currentPrice(product);
  return {
    title: product.title,
    description: summary(product),
    alternates: { canonical: url },
    // Lo vendido sigue visible para quien tenga el link, pero sale de Google
    robots: product.status === "sold" || product.status === "hidden" ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "website",
      locale: "es_CL",
      siteName: brand.name,
      url,
      title: `${product.title} · ${formatCLP(price)}`,
      description: summary(product),
      images: product.images.length ? product.images.slice(0, 4) : ["/og"],
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.title} · ${formatCLP(price)}`,
      description: summary(product),
      images: product.images.length ? product.images.slice(0, 1) : ["/og"],
    },
    other: {
      // Etiquetas de producto que leen Meta y Pinterest
      "product:price:amount": String(price),
      "product:price:currency": "CLP",
      "product:availability": product.status === "available" ? "in stock" : "out of stock",
      "product:condition": product.condition === "nuevo" ? "new" : "used",
      "product:retailer_item_id": product.id,
      "product:brand": brand.name,
    },
  };
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
  const price = currentPrice(product);
  // Precio en créditos: solo productos de la tienda (los créditos no pagan productos de vendedores)
  const creditValue = product.seller_id ? null : await getCreditValue();
  const credits = creditValue ? creditPrice(price, creditValue) : null;
  const trackItem = { id: product.id, name: product.title, price, category: category?.name };
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: summary(product),
    sku: product.id,
    productID: product.id,
    image: product.images,
    category: category?.name,
    brand: { "@type": "Brand", name: brand.name },
    itemCondition: SCHEMA_CONDITION[product.condition],
    offers: {
      "@type": "Offer",
      url: `${siteUrl()}/producto/${product.id}`,
      priceCurrency: "CLP",
      price,
      ...(isFlashActive(product) && product.flash_until ? { priceValidUntil: product.flash_until.slice(0, 10) } : {}),
      itemCondition: SCHEMA_CONDITION[product.condition],
      availability: sold || product.status === "hidden" ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
      seller: { "@type": "Organization", name: brand.name },
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "CL" },
      },
    },
  };

  return (
    <div className="-mt-4 grid gap-6 md:mt-0 md:grid-cols-2 md:gap-10">
      <TrackView productId={product.id} />
      <JsonLd data={jsonLd} />
      {!sold && <TrackViewItem item={trackItem} />}
      <Gallery product={product} category={category} />
      <div className="space-y-4">
        <div className="space-y-1">
          <Link href={`/catalogo?categoria=${product.category_slug}`} className="text-sm font-semibold text-muted underline-offset-4 hover:underline">
            {category?.name}
          </Link>
          <h1 className="text-2xl font-black leading-tight md:text-3xl">{product.title}</h1>
        </div>
        {isFlashActive(product) && product.flash_until && <FlashCountdown until={product.flash_until} />}
        <PriceTag product={product} size="lg" credits={credits} />
        {product.description && <p className="whitespace-pre-line text-muted">{product.description}</p>}

        {sold ? (
          <p className="rounded-full bg-surface p-4 text-center font-extrabold">Este producto ya se vendió</p>
        ) : (
          <div className="space-y-2">
            {reservedByOther ? (
              <p className="rounded-full bg-surface py-4 text-center font-extrabold">Apartado por otra persona</p>
            ) : (
              <AddToCart productId={product.id} maxQuantity={Math.min(10, available)} item={trackItem} />
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
        <p className="text-sm text-muted">
          <Link href="/envios" className="font-semibold underline underline-offset-4">Envíos</Link> ·{" "}
          <Link href="/devoluciones" className="font-semibold underline underline-offset-4">{brand.legal.returnDays} días para devoluciones</Link>
        </p>
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
