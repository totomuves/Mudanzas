"use client";

import { useEffect } from "react";
import { removeFromCart } from "@/lib/cart";

/** Al confirmarse el pago, saca del carrito los productos comprados. */
export function ClearPurchased({ productIds }: { productIds: string[] }) {
  const key = productIds.join(",");
  useEffect(() => {
    if (key) removeFromCart(key.split(","));
  }, [key]);
  return null;
}
