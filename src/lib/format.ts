import type { Condition, Product } from "./types";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export function formatCLP(value: number) {
  return clp.format(value);
}

export const CONDITION_LABEL: Record<Condition, string> = {
  nuevo: "Nuevo",
  como_nuevo: "Como nuevo",
  buen_estado: "Buen estado",
  con_detalles: "Con detalles",
};

export function isFlashActive(p: Pick<Product, "flash_price" | "flash_until">, now = Date.now()) {
  return p.flash_price != null && p.flash_until != null && new Date(p.flash_until).getTime() > now;
}

/** Precio vigente (igual que public.current_price en la base de datos). */
export function currentPrice(p: Pick<Product, "price" | "flash_price" | "flash_until">) {
  return isFlashActive(p) ? (p.flash_price as number) : p.price;
}

/** Porcentaje de ahorro respecto al precio original (si existe). */
export function savingsPercent(p: Pick<Product, "price" | "original_price" | "flash_price" | "flash_until">) {
  if (!p.original_price || p.original_price <= 0) return null;
  const pct = Math.round((1 - currentPrice(p) / p.original_price) * 100);
  return pct > 0 ? pct : null;
}

export function isSold(p: Pick<Product, "status">) {
  return p.status === "sold";
}

/** ¿Alguien lo tiene apartado mientras paga? */
export function isReserved(p: Pick<Product, "reserved_until">, now = Date.now()) {
  return p.reserved_until != null && new Date(p.reserved_until).getTime() > now;
}
