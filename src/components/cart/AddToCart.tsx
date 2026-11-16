"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { addToCart } from "@/lib/cart";
import { useCart } from "./useCart";
import { trackEvent, type TrackItem } from "@/lib/marketing/track";

/**
 * Botones de la ficha del producto: agregar al carrito (para pagar varios
 * productos juntos) o comprar solo este.
 */
export function AddToCart({ productId, maxQuantity, item }: { productId: string; maxQuantity: number; item?: TrackItem }) {
  const router = useRouter();
  const add = () => {
    addToCart(productId, 1, maxQuantity);
    if (item) trackEvent("add_to_cart", { items: [{ ...item, quantity: 1 }] });
  };
  const inCart = useCart().find((i) => i.id === productId);
  const full = Boolean(inCart && inCart.qty >= maxQuantity);

  return (
    <div className="space-y-2">
      {inCart ? (
        <div className="space-y-2">
          <p className="flex items-center justify-center gap-2 rounded-full bg-surface py-3 text-center font-bold">
            <Icon name="check" className="h-5 w-5 text-accent" strokeWidth={2.4} />
            En tu carrito{inCart.qty > 1 ? ` (${inCart.qty})` : ""}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/carrito" className="flex items-center justify-center gap-2 rounded-full bg-brand py-4 text-center font-extrabold text-white transition hover:bg-brand-dark">
              <Icon name="bag" className="h-5 w-5" />
              Ir a pagar
            </Link>
            {maxQuantity > 1 && !full ? (
              <button type="button" onClick={add} className="rounded-full border-2 border-foreground py-4 font-extrabold">
                Sumar otro
              </button>
            ) : (
              <Link href="/descubrir" className="flex items-center justify-center rounded-full border-2 border-foreground py-4 text-center font-extrabold">
                Seguir viendo
              </Link>
            )}
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={add}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand py-4 text-lg font-extrabold text-white transition hover:bg-brand-dark"
          >
            <Icon name="bag" className="h-5 w-5" />
            Agregar al carrito
          </button>
          <button
            type="button"
            onClick={() => router.push(`/comprar/${productId}`)}
            className="w-full rounded-full border-2 border-foreground py-3.5 font-extrabold"
          >
            Comprar solo este
          </button>
        </>
      )}
    </div>
  );
}
