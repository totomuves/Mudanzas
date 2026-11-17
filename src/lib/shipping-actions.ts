"use server";

import { quoteItems } from "@/lib/routing/quote";

export type ShippingQuoteResult = { total?: number; groups?: number[]; error?: string };

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Precio del despacho automático para mostrarlo en el checkout mientras el
 * comprador escribe su dirección. Al pagar se vuelve a calcular en el servidor.
 */
export async function quoteShippingAction(items: { id: string; qty: number }[], comuna: string, address: string): Promise<ShippingQuoteResult> {
  const clean = (Array.isArray(items) ? items.slice(0, 30) : [])
    .filter((i) => i && typeof i.id === "string" && UUID.test(i.id))
    .map((i) => ({ id: i.id, qty: Math.max(1, Math.min(50, Number(i.qty) || 1)) }));
  const c = String(comuna ?? "").trim().slice(0, 60);
  const a = String(address ?? "").trim().slice(0, 200);
  if (!clean.length || !c) return {};
  try {
    const q = await quoteItems(clean, c, a);
    if (!q.ok) return { error: q.reason === "far" ? `Por ahora no despachamos tan lejos. Puedes elegir retiro.` : `Por ahora no despachamos a ${c}.` };
    return { total: q.total, groups: q.groups.map((g) => g.price) };
  } catch (e) {
    console.error("[despacho] cotización", e);
    return { error: "No pudimos calcular el despacho. Intenta de nuevo." };
  }
}
