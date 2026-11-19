import Link from "next/link";
import { currentPrice, formatCLP } from "@/lib/format";
import type { PickForYou } from "@/lib/pick-for-you";
import type { Category } from "@/lib/types";
import { Icon } from "./Icon";
import { ProductImage } from "./ProductImage";

/**
 * Frase del título que lleva al producto elegido para el comprador.
 * Sin producto, la frase se muestra sola (sin link).
 */
export function PhraseHeadline({
  text,
  pick,
  category,
  className,
}: {
  text: string;
  pick: PickForYou | null;
  category?: Category;
  className: string;
}) {
  if (!pick) return <h1 className={className}>{text}</h1>;
  const { product, reason } = pick;
  const href = `/producto/${product.id}`;
  return (
    <div className="space-y-3">
      <h1 className={className}>
        <Link href={href} className="decoration-brand decoration-4 underline-offset-4 hover:underline">
          {text}
        </Link>
      </h1>
      <Link
        href={href}
        className="group inline-flex max-w-full items-center gap-3 rounded-full bg-surface py-1.5 pl-1.5 pr-4 transition hover:ring-2 hover:ring-foreground"
      >
        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-background">
          <ProductImage product={product} category={category} fit="cover" sizes="44px" />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-muted">{reason ?? "Elegido para ti"}</span>
          <span className="block truncate text-sm font-bold">
            {product.title} · {formatCLP(currentPrice(product))}
          </span>
        </span>
        <Icon name="arrow" className="h-5 w-5 shrink-0 transition group-hover:translate-x-1" />
      </Link>
    </div>
  );
}
