"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { cartCount } from "@/lib/cart";
import { useCart } from "./useCart";

/** Bolsa del encabezado con la cantidad de productos del carrito. */
export function CartButton({ className = "" }: { className?: string }) {
  const count = cartCount(useCart());
  return (
    <Link
      href="/carrito"
      aria-label={count ? `Carrito, ${count} ${count === 1 ? "producto" : "productos"}` : "Carrito"}
      className={`relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface ${className}`}
    >
      <Icon name="bag" className="h-6 w-6" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-black text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
