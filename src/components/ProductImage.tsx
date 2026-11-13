import Image from "next/image";
import { brand } from "@/brand";
import type { Category, Product } from "@/lib/types";

const GRADIENTS = [
  "from-orange-200 to-rose-200",
  "from-amber-200 to-lime-200",
  "from-sky-200 to-indigo-200",
  "from-emerald-200 to-teal-200",
  "from-fuchsia-200 to-pink-200",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Foto del producto o, si no tiene, un fondo con el emoji de su categoría. */
export function ProductImage({
  product,
  category,
  index = 0,
  sizes = "(max-width: 768px) 100vw, 400px",
  priority = false,
  className = "",
}: {
  product: Pick<Product, "id" | "title" | "images">;
  category?: Pick<Category, "emoji"> | null;
  index?: number;
  sizes?: string;
  priority?: boolean;
  className?: string;
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
        className={`select-none object-cover ${className}`}
      />
    );
  }
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${
        GRADIENTS[hash(product.id) % GRADIENTS.length]
      } ${className}`}
    >
      <span className="text-8xl drop-shadow-sm" aria-hidden>
        {category?.emoji ?? brand.logoEmoji}
      </span>
    </div>
  );
}
