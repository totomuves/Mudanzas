/**
 * CARRITO (navegador)
 * Se guarda en el teléfono o computador del comprador (localStorage), así
 * funciona sin crear cuenta. Las unidades se apartan recién al pagar.
 */

export type CartItem = { id: string; qty: number };

const KEY = "muveo-carrito";
const EVENT = "muveo-carrito";
export const CART_MAX_ITEMS = 30;

export function readCart(): CartItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((i) => i && typeof i.id === "string" && /^[0-9a-f-]{36}$/i.test(i.id))
      .map((i) => ({ id: i.id as string, qty: Math.max(1, Math.min(50, Number(i.qty) || 1)) }))
      .slice(0, CART_MAX_ITEMS);
  } catch {
    return [];
  }
}

export function writeCart(items: CartItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, CART_MAX_ITEMS)));
  } catch {
    // Sin almacenamiento (modo privado): el carrito vive solo en esta pestaña
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Agrega un producto (o suma unidades sin pasar del máximo disponible). */
export function addToCart(id: string, qty = 1, max = 50) {
  const items = readCart();
  const found = items.find((i) => i.id === id);
  if (found) found.qty = Math.min(max, found.qty + qty);
  else items.push({ id, qty: Math.min(max, qty) });
  writeCart(items);
}

export function setCartQty(id: string, qty: number) {
  writeCart(readCart().map((i) => (i.id === id ? { ...i, qty: Math.max(1, qty) } : i)));
}

export function removeFromCart(ids: string | string[]) {
  const drop = new Set(Array.isArray(ids) ? ids : [ids]);
  writeCart(readCart().filter((i) => !drop.has(i.id)));
}

export function clearCart() {
  writeCart([]);
}

export function cartCount(items: CartItem[]) {
  return items.reduce((a, i) => a + i.qty, 0);
}

/** Avisa cada vez que cambia el carrito (en esta pestaña o en otra). */
export function onCartChange(cb: () => void) {
  const storage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", storage);
  };
}
