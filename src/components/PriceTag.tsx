import { currentPrice, formatCLP, isFlashActive, savingsPercent } from "@/lib/format";
import type { Product } from "@/lib/types";

/** Precio grande en negrita con el signo $ pequeño arriba (estilo catálogo). */
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
  const amount = formatCLP(currentPrice(product)).replace(/^\$\s?/, "");
  const lg = size === "lg";
  return (
    <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
      <span
        className={`inline-flex items-start font-black leading-none tracking-tight ${lg ? "text-4xl" : "text-xl"} ${
          flash ? "text-brand" : ""
        }`}
      >
        <span className={`${lg ? "mt-1 text-lg" : "mt-0.5 text-xs"} mr-px`}>$</span>
        {amount}
      </span>
      {crossed ? <span className="text-sm text-muted line-through">{formatCLP(crossed)}</span> : null}
      {pct ? (
        <span className="rounded-full bg-accent/12 px-2 py-0.5 text-xs font-extrabold text-accent">-{pct}%</span>
      ) : null}
    </div>
  );
}
