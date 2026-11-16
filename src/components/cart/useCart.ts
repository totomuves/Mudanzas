"use client";

import { useSyncExternalStore } from "react";
import { onCartChange, readCart, type CartItem } from "@/lib/cart";

let cache: { raw: string; items: CartItem[] } = { raw: "[]", items: [] };
const EMPTY: CartItem[] = [];

function snapshot() {
  const items = readCart();
  const raw = JSON.stringify(items);
  if (raw !== cache.raw) cache = { raw, items };
  return cache.items;
}

/** Productos del carrito; se actualiza solo cuando cambia. */
export function useCart() {
  return useSyncExternalStore(onCartChange, snapshot, () => EMPTY);
}
