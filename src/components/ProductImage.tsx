import Image from "next/image";
import { brand } from "@/brand";
import type { Category, Product } from "@/lib/types";

/**
 * Foto del producto o, si no tiene, un fondo gris claro con el emoji de su categoría.
 * fit="contain" muestra el producto completo sobre gris (estilo catálogo); las
 * fotos con fondo blanco se funden con el gris.
 */
export function ProductImage({
  product,
  category,
  index = 0,
  sizes = "(max-width: 768px) 100vw, 400px",
  priority = false,
  className = "",
  fit = "cover",
}: {
  product: Pick<Product, "id" | "title" | "images">;
  category?: Pick<Category, "emoji"> | null;
  index?: number;
  sizes?: string;
  priority?: boolean;
  className?: string;
  fit?: "cover" | "contain";
}) {
  const src = product.images[index];
  if (src) {
    return (
      <Image
        src={src}
        alt={product.title}
        fill
        sizes={sizes}
        priority={priority}
        draggable={false}
        className={`select-none ${fit === "contain" ? "photo-on-surface object-contain p-[6%]" : "object-cover"} ${className}`}
      />
    );
  }
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center bg-surface ${className}`}
    >
      <span className="text-7xl opacity-80" aria-hidden>
        {category?.emoji ?? brand.logoEmoji}
      </span>
    </div>
  );
}
