import { currentPrice, formatCLP, isFlashActive, savingsPercent } from "@/lib/format";
import type { Product } from "@/lib/types";

export function PriceTag({
  product,
  size = "md",
}: {
  product: Pick<Product, "price" | "original_price" | "flash_price" | "flash_until">;
  size?: "md" | "lg";
}) {
  const flash = isFlashActive(product);
  const pct = savingsPercent(product);
  const crossed = flash ? product.price : product.original_price;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className={`font-black ${size === "lg" ? "text-3xl" : "text-xl"} ${flash ? "text-brand" : ""}`}>
        {formatCLP(currentPrice(product))}
      </span>
      {crossed ? (
        <span className="text-sm text-muted line-through">{formatCLP(crossed)}</span>
      ) : null}
      {pct ? (
        <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-xs font-extrabold text-accent">
          -{pct}%
        </span>
      ) : null}
    </div>
  );
}
