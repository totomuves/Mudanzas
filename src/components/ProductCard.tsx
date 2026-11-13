import Link from "next/link";
import { CONDITION_LABEL, isFlashActive } from "@/lib/format";
import type { Category, Product } from "@/lib/types";
import { ProductImage } from "./ProductImage";
import { PriceTag } from "./PriceTag";

export function ProductCard({ product, category }: { product: Product; category?: Category }) {
  const sold = product.status === "sold";
  return (
    <Link
      href={`/producto/${product.id}`}
      className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative aspect-square">
        <ProductImage product={product} category={category} sizes="(max-width: 768px) 50vw, 250px" />
        {isFlashActive(product) && !sold && (
          <span className="absolute left-2 top-2 rounded-full bg-yellow-300 px-2 py-0.5 text-xs font-extrabold text-yellow-950">
            ⚡ Relámpago
          </span>
        )}
        {sold && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="rotate-[-8deg] rounded-lg border-4 border-white px-3 py-1 text-xl font-black text-white">
              VENDIDO
            </span>
          </div>
        )}
      </div>
      <div className="space-y-1 p-3">
        <p className="line-clamp-1 font-bold">{product.title}</p>
        <PriceTag product={product} />
        <p className="text-xs text-muted">
          {category ? `${category.emoji} ${category.name} · ` : ""}
          {CONDITION_LABEL[product.condition]}
          {product.comuna ? ` · ${product.comuna}` : ""}
        </p>
      </div>
    </Link>
  );
}
