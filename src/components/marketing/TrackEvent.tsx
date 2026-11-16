"use client";

import { useEffect } from "react";
import { trackEvent, trackPurchaseOnce, type TrackItem } from "@/lib/marketing/track";

/** Mide que se vio un producto (una vez por visita a la ficha). */
export function TrackViewItem({ item }: { item: TrackItem }) {
  const key = `${item.id}:${item.price}`;
  useEffect(() => {
    trackEvent("view_item", { items: [item] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

/** Mide una compra pagada (una sola vez por compra, aunque se recargue). */
export function TrackPurchase({
  transactionId,
  value,
  shipping,
  items,
}: {
  transactionId: string;
  value: number;
  shipping?: number;
  items: TrackItem[];
}) {
  useEffect(() => {
    trackPurchaseOnce({ transactionId, value, shipping, items });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId]);
  return null;
}
