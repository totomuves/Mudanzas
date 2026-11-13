"use client";

import { useState } from "react";
import { ProductImage } from "@/components/ProductImage";
import type { Category, Product } from "@/lib/types";

export function Gallery({ product, category }: { product: Product; category?: Category }) {
  const [i, setI] = useState(0);
  return (
    <div className="space-y-3">
      <div className="relative -mx-4 aspect-square overflow-hidden bg-surface md:mx-0 md:rounded-image">
        <ProductImage product={product} category={category} index={i} fit="contain" priority sizes="(max-width: 768px) 100vw, 500px" />
      </div>
      {product.images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {product.images.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface ring-2 ${idx === i ? "ring-foreground" : "ring-transparent"}`}
            >
              <ProductImage product={product} index={idx} fit="contain" sizes="64px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
