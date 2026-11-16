/**
 * Eventos de venta para Google Analytics, Meta Pixel y TikTok Pixel.
 * Los IDs de producto son los mismos del catálogo (/feeds/productos.xml),
 * así las campañas de catálogo saben qué producto se vio o compró.
 */

import { isStaffPath, tracking } from "./config";

export type TrackItem = {
  id: string;
  name: string;
  /** Precio unitario en CLP */
  price: number;
  quantity?: number;
  category?: string;
};

type EventName = "view_item" | "add_to_cart" | "begin_checkout" | "purchase";

type Payload = {
  items: TrackItem[];
  /** Total en CLP (si falta, se suma precio × cantidad) */
  value?: number;
  transactionId?: string;
  shipping?: number;
};

const META: Record<EventName, string> = {
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  purchase: "Purchase",
};

const TIKTOK: Record<EventName, string> = {
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  purchase: "CompletePayment",
};

type Fn = (...args: unknown[]) => void;
type MarketingWindow = Window & { gtag?: Fn; fbq?: Fn; ttq?: { track: Fn; page: Fn } };

/**
 * Los scripts de medición cargan unos instantes después de la página: si un
 * evento llega antes (por ejemplo, al abrir directo un producto), se reintenta.
 */
function whenReady(run: (w: MarketingWindow) => void, tries = 0) {
  const w = window as MarketingWindow;
  const missing =
    ((tracking.gaId || tracking.googleAdsId) && !w.gtag) ||
    (tracking.metaPixelId && !w.fbq) ||
    (tracking.tiktokPixelId && !w.ttq);
  if (missing && tries < 20) {
    setTimeout(() => whenReady(run, tries + 1), 250);
    return;
  }
  run(w);
}

export function trackEvent(name: EventName, payload: Payload) {
  if (typeof window === "undefined" || !payload.items.length) return;
  if (isStaffPath(window.location.pathname)) return;
  whenReady((w) => send(w, name, payload));
}

function send(w: MarketingWindow, name: EventName, { items, value, transactionId, shipping }: Payload) {
  const total = value ?? items.reduce((a, i) => a + i.price * (i.quantity ?? 1), 0);
  const eventId = transactionId ? `${name}-${transactionId}` : undefined;

  try {
    w.gtag?.("event", name, {
      currency: "CLP",
      value: total,
      ...(transactionId ? { transaction_id: transactionId } : {}),
      ...(shipping ? { shipping } : {}),
      items: items.map((i) => ({
        item_id: i.id,
        item_name: i.name,
        item_brand: "MUVEO",
        item_category: i.category,
        price: i.price,
        quantity: i.quantity ?? 1,
      })),
    });
  } catch {}

  try {
    w.fbq?.(
      "track",
      META[name],
      {
        content_ids: items.map((i) => i.id),
        content_type: "product",
        contents: items.map((i) => ({ id: i.id, quantity: i.quantity ?? 1, item_price: i.price })),
        content_name: items.length === 1 ? items[0].name : undefined,
        num_items: items.reduce((a, i) => a + (i.quantity ?? 1), 0),
        value: total,
        currency: "CLP",
      },
      eventId ? { eventID: eventId } : undefined,
    );
  } catch {}

  try {
    w.ttq?.track(
      TIKTOK[name],
      {
        contents: items.map((i) => ({
          content_id: i.id,
          content_type: "product",
          content_name: i.name,
          quantity: i.quantity ?? 1,
          price: i.price,
        })),
        value: total,
        currency: "CLP",
      },
      eventId ? { event_id: eventId } : undefined,
    );
  } catch {}
}

/** Cuenta una compra una sola vez aunque el comprador recargue la página. */
export function trackPurchaseOnce(payload: Payload & { transactionId: string }) {
  const key = `muveo-compra-medida:${payload.transactionId}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    // Sin almacenamiento: se mide igual (puede repetirse si recarga)
  }
  trackEvent("purchase", payload);
}

/** Avisa a Meta y TikTok de un cambio de página (Google lo detecta solo). */
export function trackPageView() {
  if (typeof window === "undefined") return;
  const w = window as MarketingWindow;
  try {
    w.fbq?.("track", "PageView");
  } catch {}
  try {
    w.ttq?.page();
  } catch {}
}
