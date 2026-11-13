// Servicio de mudanzas: tipos y cálculo de cotización.
// El mismo cálculo se usa en el navegador (precio en vivo) y en el servidor
// (precio definitivo al reservar), así nadie puede manipular el precio.

export type ServiceType = {
  slug: string;
  name: string;
  emoji: string;
  description: string;
  includes: string[];
  base_price: number;
  crew_size: number;
  est_hours: number;
  sort_order: number;
  active: boolean;
};

export type DistanceKey = "misma_comuna" | "cerca" | "media" | "lejos" | "regiones";

export const DISTANCES: { key: DistanceKey; label: string; hint: string }[] = [
  { key: "misma_comuna", label: "Misma comuna", hint: "Menos de 5 km" },
  { key: "cerca", label: "Cerca", hint: "5 a 15 km" },
  { key: "media", label: "Media", hint: "15 a 30 km" },
  { key: "lejos", label: "Lejos", hint: "Más de 30 km en la RM" },
  { key: "regiones", label: "Otra región", hint: "Se confirma por WhatsApp" },
];

export type MovingSettings = {
  distance_prices: Record<DistanceKey, number>;
  price_per_floor: number;
  packing_pct: number;
  heavy_item_price: number;
  weekend_surcharge_pct: number;
  slot_times: string[];
  crews_per_slot: number;
  closed_weekdays: number[];
  min_notice_hours: number;
  booking_days_ahead: number;
  whatsapp: string | null;
};

export type QuoteInput = {
  service: Pick<ServiceType, "base_price">;
  distance: DistanceKey;
  originFloor: number;
  originElevator: boolean;
  destFloor: number;
  destElevator: boolean;
  packing: boolean;
  heavyItems: number;
  day?: string | null; // YYYY-MM-DD
};

export type QuoteLine = { label: string; amount: number };

function floorsCost(floor: number, elevator: boolean, perFloor: number) {
  return elevator ? 0 : Math.max(0, Math.min(40, floor) - 1) * perFloor;
}

/** ¿El día (YYYY-MM-DD) es sábado? Se calcula sin zona horaria. */
export function isSaturday(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 6;
}

export function computeQuote(input: QuoteInput, s: MovingSettings) {
  const lines: QuoteLine[] = [{ label: "Servicio base", amount: input.service.base_price }];
  const dist = s.distance_prices[input.distance] ?? 0;
  if (dist) lines.push({ label: "Distancia", amount: dist });
  const floors =
    floorsCost(input.originFloor, input.originElevator, s.price_per_floor) +
    floorsCost(input.destFloor, input.destElevator, s.price_per_floor);
  if (floors) lines.push({ label: "Pisos por escalera", amount: floors });
  if (input.packing) {
    lines.push({ label: "Embalaje", amount: Math.round((input.service.base_price * s.packing_pct) / 100) });
  }
  const heavy = Math.max(0, Math.min(10, input.heavyItems));
  if (heavy) lines.push({ label: `Objetos pesados (${heavy})`, amount: heavy * s.heavy_item_price });

  let subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  if (input.day && isSaturday(input.day) && s.weekend_surcharge_pct) {
    const extra = Math.round((subtotal * s.weekend_surcharge_pct) / 100);
    lines.push({ label: `Recargo sábado (${s.weekend_surcharge_pct}%)`, amount: extra });
    subtotal += extra;
  }
  // Redondeo a miles
  const total = Math.round(subtotal / 1000) * 1000;
  return { lines, total };
}

export const BOOKING_STATUS: Record<string, { label: string; icon: string }> = {
  requested: { label: "Solicitada", icon: "📝" },
  confirmed: { label: "Confirmada", icon: "✅" },
  completed: { label: "Realizada", icon: "🏁" },
  cancelled: { label: "Cancelada", icon: "🚫" },
};

export function formatDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const s = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
