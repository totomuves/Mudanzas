import Link from "next/link";
import { CONDITION_LABEL, isFlashActive } from "@/lib/format";
import type { Category, Product } from "@/lib/types";
import { ProductImage } from "./ProductImage";
import { PriceTag } from "./PriceTag";

export function ProductCard({ product, category }: { product: Product; category?: Category }) {
  const sold = product.status === "sold";
  return (
    <Link href={`/producto/${product.id}`} className="group block space-y-2">
      <div className="relative aspect-square overflow-hidden rounded-image bg-surface">
        <ProductImage
          product={product}
          category={category}
          fit="contain"
          sizes="(max-width: 768px) 50vw, 250px"
          className="transition duration-300 group-hover:scale-[1.03]"
        />
        {isFlashActive(product) && !sold && (
          <span className="absolute left-2 top-2 rounded-full bg-flash px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-flash-text">
            Oferta relámpago
          </span>
        )}
        {!sold && product.quantity > 1 && (
          <span className="absolute right-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-bold">
            x{product.quantity}
          </span>
        )}
        {sold && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <span className="rounded-full bg-foreground px-3 py-1 text-sm font-extrabold uppercase tracking-wide text-background">
              Vendido
            </span>
          </div>
        )}
      </div>
      <div className="space-y-0.5 px-0.5">
        <p className="line-clamp-1 text-[15px] font-bold leading-snug group-hover:underline">{product.title}</p>
        <p className="line-clamp-1 text-xs text-muted">
          {category ? `${category.name} · ` : ""}
          {CONDITION_LABEL[product.condition]}
          {product.comuna ? ` · ${product.comuna}` : ""}
        </p>
        <PriceTag product={product} />
      </div>
    </Link>
  );
}
