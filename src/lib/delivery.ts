/**
 * REPARTO · datos y cálculos compartidos (servidor y navegador)
 * Tamaños de producto, tipos de vehículo, franjas horarias y fechas de
 * despacho en hora de Santiago.
 */

export const TZ = "America/Santiago";

// -------------------------------------------------------------
// Tamaño de los productos
// -------------------------------------------------------------
export type ItemSize = "chico" | "mediano" | "grande" | "muy_grande";

export const SIZES: Record<ItemSize, { label: string; hint: string; m3: number; kg: number; rank: number; serviceMin: number }> = {
  chico: { label: "Chico", hint: "Cabe en una caja: lámpara, libros, ropa", m3: 0.05, kg: 5, rank: 0, serviceMin: 0 },
  mediano: { label: "Mediano", hint: "Silla, microondas, velador, bicicleta", m3: 0.3, kg: 20, rank: 1, serviceMin: 3 },
  grande: { label: "Grande", hint: "Sillón, cómoda, lavadora, mesa", m3: 1, kg: 55, rank: 2, serviceMin: 8 },
  muy_grande: { label: "Muy grande", hint: "Sofá 3 cuerpos, refrigerador, cama 2 plazas", m3: 2.2, kg: 95, rank: 3, serviceMin: 15 },
};
export const SIZE_KEYS = Object.keys(SIZES) as ItemSize[];

/** Tamaño típico de cada categoría cuando el producto no lo indica. */
const CATEGORY_SIZE: Record<string, ItemSize> = {
  muebles: "grande", living: "grande", dormitorio: "grande", electro: "grande", comedor: "grande",
  tecnologia: "mediano", deco: "mediano", ninos: "mediano", deporte: "mediano", herramientas: "mediano", mascotas: "mediano",
  cocina: "chico", libros: "chico", ropa: "chico",
};

export function itemSize(p: { size?: string | null; category_slug?: string | null }): ItemSize {
  if (p.size && p.size in SIZES) return p.size as ItemSize;
  return CATEGORY_SIZE[p.category_slug ?? ""] ?? "mediano";
}

/** Carga que ocupa un pedido (usa peso y volumen exactos si se ingresaron). */
export function orderLoad(
  p: {
    size?: string | null;
    category_slug?: string | null;
    weight_kg?: number | string | null;
    volume_m3?: number | string | null;
    fragile?: boolean | null;
    high_value?: boolean | null;
    needs_accessories?: string[] | null;
  },
  quantity = 1,
) {
  const s = SIZES[itemSize(p)];
  const kg = p.weight_kg != null && Number(p.weight_kg) > 0 ? Number(p.weight_kg) : s.kg;
  const m3 = p.volume_m3 != null && Number(p.volume_m3) > 0 ? Number(p.volume_m3) : s.m3;
  // Lo frágil y lo de valor se carga y envuelve con más calma
  const care = p.high_value ? HANDLING_MINUTES.lujo : p.fragile ? HANDLING_MINUTES.fragil : 0;
  return {
    size: itemSize(p),
    rank: s.rank,
    kg: kg * quantity,
    m3: m3 * quantity,
    serviceMin: s.serviceMin + Math.max(0, quantity - 1) * 2 + care * quantity,
    needs: cleanAccessories(p.needs_accessories),
  };
}

/** Minutos extra por unidad para envolver y cargar con cuidado. */
export const HANDLING_MINUTES = { fragil: 5, lujo: 12 };

// -------------------------------------------------------------
// Vehículos
// -------------------------------------------------------------
export type VehicleKind = "auto" | "camioneta" | "furgon" | "camion";

// hourlyCost: chofer y ayudantes por hora (total del vehículo), valores de referencia
export const VEHICLE_KINDS: Record<VehicleKind, { label: string; m3: number; kg: number; maxSize: ItemSize; costPerKm: number; crew: number; hourlyCost: number }> = {
  auto: { label: "Auto", m3: 0.8, kg: 250, maxSize: "mediano", costPerKm: 150, crew: 1, hourlyCost: 6000 },
  camioneta: { label: "Camioneta", m3: 2.5, kg: 700, maxSize: "grande", costPerKm: 210, crew: 1, hourlyCost: 7000 },
  furgon: { label: "Furgón", m3: 8, kg: 1200, maxSize: "muy_grande", costPerKm: 280, crew: 2, hourlyCost: 13000 },
  camion: { label: "Camión", m3: 20, kg: 3500, maxSize: "muy_grande", costPerKm: 450, crew: 2, hourlyCost: 16000 },
};
export const VEHICLE_KEYS = Object.keys(VEHICLE_KINDS) as VehicleKind[];

/**
 * Accesorios de los vehículos. Un producto puede pedir uno (ej: bicicleta → porta
 * bicicleta) y entonces solo se sugieren los vehículos que lo tienen.
 * Cada vehículo también puede tener accesorios propios escritos a mano.
 */
export const ACCESSORIES = {
  porta_bicicleta: { label: "Porta bicicleta", hint: "Bicicletas sin ocupar el espacio de carga" },
  parrilla: { label: "Parrilla de techo", hint: "Cosas largas: escaleras, tablas, kayak" },
  rampa: { label: "Rampa", hint: "Subir cosas con ruedas o muy pesadas" },
  plataforma: { label: "Plataforma hidráulica", hint: "Levanta lo pesado hasta la caja (refrigerador, piano)" },
  carro_arrastre: { label: "Carro de arrastre", hint: "Espacio extra enganchado atrás" },
  mantas: { label: "Mantas y amarras", hint: "Protegen y fijan lo delicado o de valor" },
  carro_carga: { label: "Carro de carga (diablito)", hint: "Mover lo pesado por escaleras o pasillos" },
  carga_cerrada: { label: "Carga cerrada", hint: "Protegida de la lluvia y el polvo" },
} as const;
export type AccessoryKey = keyof typeof ACCESSORIES;
export const ACCESSORY_KEYS = Object.keys(ACCESSORIES) as AccessoryKey[];

/** Nombre para mostrar de un accesorio (los propios se muestran tal cual). */
export function accessoryLabel(a: string) {
  return a in ACCESSORIES ? ACCESSORIES[a as AccessoryKey].label : a;
}

/** Limpia una lista de accesorios: claves conocidas o textos propios cortos, sin repetir. */
export function cleanAccessories(list: unknown): string[] {
  const arr = Array.isArray(list) ? list : [];
  const out: string[] = [];
  for (const raw of arr) {
    const t = String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
    if (!t) continue;
    const known = ACCESSORY_KEYS.find((k) => k === t || ACCESSORIES[k].label.toLowerCase() === t.toLowerCase());
    const v = known ?? t;
    if (!out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out.slice(0, 20);
}

/** ¿El vehículo tiene todos los accesorios que pide la carga? */
export function hasAccessories(v: { accessories?: string[] | null }, needs: string[] | null | undefined) {
  if (!needs?.length) return true;
  const own = (v.accessories ?? []).map((a) => a.toLowerCase());
  return needs.every((n) => own.includes(n.toLowerCase()));
}

export type Vehicle = {
  id: string;
  name: string;
  plate: string | null;
  kind: VehicleKind;
  capacity_kg: number;
  capacity_m3: number;
  max_item_size: ItemSize;
  /** Bencina y desgaste por km */
  cost_per_km: number;
  /** Peajes (TAG) por viaje, ida y vuelta */
  toll_per_trip?: number | null;
  /** Chofer y ayudantes por hora, total del vehículo */
  hourly_cost?: number | null;
  crew: number;
  driver_id: string | null;
  active: boolean;
  /** Accesorios: claves de ACCESSORIES o textos propios */
  accessories?: string[] | null;
  /** Parking: en una bodega, o en una dirección propia (si no, en la bodega principal) */
  parking_warehouse_id?: string | null;
  parking_address?: string | null;
  parking_lat?: number | null;
  parking_lng?: number | null;
};

// -------------------------------------------------------------
// Bodegas (dónde están guardados los productos de la tienda)
// -------------------------------------------------------------
export type Warehouse = {
  id: string;
  name: string;
  address: string | null;
  comuna: string | null;
  lat: number | null;
  lng: number | null;
  is_default: boolean;
  active: boolean;
  notes: string | null;
};

/** Parada fija de una ruta: salida/llegada al parking y paso por bodegas. */
export type RouteWaypoint = {
  kind: "salida" | "carga" | "descarga" | "llegada";
  name: string;
  lat: number;
  lng: number;
  eta: string;
};

export const WAYPOINT_LABEL: Record<RouteWaypoint["kind"], string> = {
  salida: "Sale del parking",
  carga: "Carga en",
  descarga: "Deja los retiros en",
  llegada: "Vuelve al parking",
};

// -------------------------------------------------------------
// Ajustes de reparto
// -------------------------------------------------------------
export type DeliverySettings = {
  days: number[];
  cutoff_hour: number;
  start_time: string;
  end_time: string;
  midday_time: string;
  service_minutes: number;
  window_minutes: number;
  depot_address: string | null;
  depot_lat: number | null;
  depot_lng: number | null;
  balance_routes: boolean;
};

export const DEFAULT_DELIVERY_SETTINGS: DeliverySettings = {
  days: [2, 5],
  cutoff_hour: 18,
  start_time: "09:00",
  end_time: "19:00",
  midday_time: "14:00",
  service_minutes: 12,
  window_minutes: 120,
  depot_address: null,
  depot_lat: null,
  depot_lng: null,
  balance_routes: false,
};

export const WEEKDAYS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export type DeliverySlot = "manana" | "tarde" | "cualquiera";

export function slotLabel(slot: DeliverySlot, s: DeliverySettings) {
  const a = hhmm(s.start_time), m = hhmm(s.midday_time), b = hhmm(s.end_time);
  if (slot === "manana") return `Mañana (${a} a ${m})`;
  if (slot === "tarde") return `Tarde (${m} a ${b})`;
  return `Cualquier hora (${a} a ${b})`;
}

/** Ventana del día (segundos desde medianoche) según la franja elegida. */
export function slotWindow(slot: DeliverySlot, s: DeliverySettings): [number, number] {
  const a = toSeconds(s.start_time), m = toSeconds(s.midday_time), b = toSeconds(s.end_time);
  if (slot === "manana") return [a, m];
  if (slot === "tarde") return [m, b];
  return [a, b];
}

// -------------------------------------------------------------
// Horas y fechas en Santiago
// -------------------------------------------------------------
export function hhmm(t: string) {
  return t.slice(0, 5);
}

export function toSeconds(t: string) {
  const [h, m, s] = t.split(":").map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

export function secondsToHHMM(sec: number) {
  const s = Math.max(0, Math.round(sec / 60)) * 60;
  return `${String(Math.floor(s / 3600) % 24).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
}

/** Fecha (AAAA-MM-DD), hora y segundos del día en Santiago para un instante. */
export function santiagoParts(d: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const seconds = Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  return { date, hour: Number(parts.hour), seconds };
}

/** Instante UTC de una hora local de Santiago en una fecha. */
export function santiagoToDate(date: string, seconds: number) {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d) + seconds * 1000;
  // Ajusta por la diferencia horaria de ese día (cambia con el horario de verano)
  let t = guess;
  for (let i = 0; i < 2; i++) {
    const p = santiagoParts(new Date(t));
    const [py, pm, pd] = p.date.split("-").map(Number);
    const shown = Date.UTC(py, pm - 1, pd) + p.seconds * 1000;
    t += guess - shown;
  }
  return new Date(t);
}

export function addDays(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Día de la semana ISO (1 = lunes … 7 = domingo) de una fecha AAAA-MM-DD. */
export function isoWeekday(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}

/**
 * Próximas fechas de despacho para un pedido hecho ahora.
 * Entra al despacho de un día si se compra antes de la hora de corte del día anterior.
 */
export function upcomingDeliveryDates(s: Pick<DeliverySettings, "days" | "cutoff_hour">, now = new Date(), count = 4) {
  const { date: today, hour } = santiagoParts(now);
  const out: string[] = [];
  if (!s.days?.length) return out;
  for (let i = 0; i < 60 && out.length < count; i++) {
    const day = addDays(today, i);
    if (!s.days.includes(isoWeekday(day))) continue;
    const cutoffDay = addDays(day, -1);
    if (cutoffDay > today || (cutoffDay === today && hour < s.cutoff_hour)) out.push(day);
  }
  return out;
}

export function formatDeliveryDate(date: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

export function formatTime(iso: string | Date) {
  return new Intl.DateTimeFormat("es-CL", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

/** Colores de las rutas en el mapa (paleta del logo y complementarios). */
export const ROUTE_COLORS = ["#5b3fe0", "#0b8f86", "#e0609a", "#e8912d", "#2f7fd8", "#8a4fbf", "#3e9b3a", "#c23b3b"];

// -------------------------------------------------------------
// Enlaces de navegación
// -------------------------------------------------------------
export function mapsDirections(dest: { lat: number | null; lng: number | null; address?: string | null }, waypoints: { lat: number; lng: number }[] = []) {
  const d = dest.lat != null && dest.lng != null ? `${dest.lat},${dest.lng}` : (dest.address ?? "");
  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  u.searchParams.set("destination", d);
  u.searchParams.set("travelmode", "driving");
  if (waypoints.length) u.searchParams.set("waypoints", waypoints.slice(0, 9).map((w) => `${w.lat},${w.lng}`).join("|"));
  return u.toString();
}

export function wazeLink(dest: { lat: number | null; lng: number | null; address?: string | null }) {
  if (dest.lat != null && dest.lng != null) return `https://waze.com/ul?ll=${dest.lat},${dest.lng}&navigate=yes`;
  return `https://waze.com/ul?q=${encodeURIComponent(dest.address ?? "")}&navigate=yes`;
}

export function whatsappLink(phone: string | null | undefined, text: string) {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 9 && digits.startsWith("9")) digits = `56${digits}`;
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}
