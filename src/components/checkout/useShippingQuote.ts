"use client";

import { useEffect, useState } from "react";
import { quoteShippingAction, type ShippingQuoteResult } from "@/lib/shipping-actions";

/**
 * Despacho automático: pide el precio al servidor cuando el comprador elige
 * comuna o termina de escribir la dirección (espera 700 ms sin cambios).
 */
export function useShippingQuote(opts: { enabled: boolean; items: { id: string; qty: number }[]; comuna: string; address: string }) {
  const { enabled, comuna, address } = opts;
  const itemsKey = JSON.stringify(opts.items);
  const key = enabled && comuna ? `${itemsKey}|${comuna}|${address.trim()}` : "";
  const [result, setResult] = useState<{ key: string; value: ShippingQuoteResult } | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const value = await quoteShippingAction(JSON.parse(itemsKey), comuna, address).catch(() => ({ error: "No pudimos calcular el despacho." }));
      if (!cancelled) setResult({ key, value });
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = result && result.key === key ? result.value : null;
  return {
    loading: Boolean(key) && !current,
    total: current?.total ?? null,
    groups: current?.groups ?? null,
    error: current?.error ?? null,
  };
}
