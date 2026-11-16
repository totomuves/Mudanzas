import "server-only";
import { estimatedMatrix, trafficFactor } from "./optimizer";

/**
 * UBICACIONES Y TIEMPOS DE VIAJE
 *
 * Con GOOGLE_MAPS_API_KEY (recomendado):
 *  - Direcciones → coordenadas con Geocoding API
 *  - Tiempos de viaje con tráfico real con Routes API (computeRouteMatrix)
 * Sin clave:
 *  - Direcciones con OpenStreetMap (Nominatim, gratis, 1 consulta por segundo)
 *  - Tiempos estimados por distancia y hora punta de Santiago
 * Si una dirección no se encuentra, se usa el centro de la comuna.
 */

export type Point = { lat: number; lng: number };
export type GeoSource = "google" | "osm" | "comuna";

const KEY = () => process.env.GOOGLE_MAPS_API_KEY || "";
export const hasGoogleMaps = () => Boolean(KEY());

// Región Metropolitana (para descartar resultados en otra ciudad)
const inRM = (p: Point) => p.lat > -34.4 && p.lat < -32.8 && p.lng > -71.8 && p.lng < -69.9;

// Centro aproximado de cada comuna
const COMUNA_CENTER: Record<string, Point> = {
  Cerrillos: { lat: -33.497, lng: -70.716 }, "Cerro Navia": { lat: -33.425, lng: -70.744 }, Conchalí: { lat: -33.384, lng: -70.675 },
  "El Bosque": { lat: -33.562, lng: -70.676 }, "Estación Central": { lat: -33.459, lng: -70.698 }, Huechuraba: { lat: -33.374, lng: -70.637 },
  Independencia: { lat: -33.416, lng: -70.665 }, "La Cisterna": { lat: -33.531, lng: -70.664 }, "La Florida": { lat: -33.523, lng: -70.598 },
  "La Granja": { lat: -33.54, lng: -70.623 }, "La Pintana": { lat: -33.583, lng: -70.634 }, "La Reina": { lat: -33.445, lng: -70.539 },
  "Las Condes": { lat: -33.411, lng: -70.57 }, "Lo Barnechea": { lat: -33.353, lng: -70.518 }, "Lo Espejo": { lat: -33.521, lng: -70.692 },
  "Lo Prado": { lat: -33.444, lng: -70.725 }, Macul: { lat: -33.491, lng: -70.599 }, Maipú: { lat: -33.51, lng: -70.757 },
  Ñuñoa: { lat: -33.456, lng: -70.598 }, "Pedro Aguirre Cerda": { lat: -33.49, lng: -70.677 }, Peñalolén: { lat: -33.486, lng: -70.544 },
  Providencia: { lat: -33.431, lng: -70.609 }, Pudahuel: { lat: -33.44, lng: -70.759 }, "Puente Alto": { lat: -33.611, lng: -70.575 },
  Quilicura: { lat: -33.36, lng: -70.729 }, "Quinta Normal": { lat: -33.428, lng: -70.698 }, Recoleta: { lat: -33.407, lng: -70.64 },
  Renca: { lat: -33.405, lng: -70.728 }, "San Bernardo": { lat: -33.592, lng: -70.7 }, "San Joaquín": { lat: -33.496, lng: -70.628 },
  "San Miguel": { lat: -33.497, lng: -70.651 }, "San Ramón": { lat: -33.536, lng: -70.642 }, Santiago: { lat: -33.448, lng: -70.66 },
  Vitacura: { lat: -33.39, lng: -70.59 }, Colina: { lat: -33.203, lng: -70.675 }, Lampa: { lat: -33.286, lng: -70.876 },
  "Padre Hurtado": { lat: -33.573, lng: -70.815 }, Peñaflor: { lat: -33.606, lng: -70.876 }, Talagante: { lat: -33.664, lng: -70.928 },
  Buin: { lat: -33.732, lng: -70.742 }, Pirque: { lat: -33.634, lng: -70.574 }, "San José de Maipo": { lat: -33.641, lng: -70.352 },
};
export const SANTIAGO_CENTER = COMUNA_CENTER.Santiago;

export function comunaCenter(comuna: string | null | undefined): Point {
  return (comuna && COMUNA_CENTER[comuna]) || SANTIAGO_CENTER;
}

let lastOsm = 0;
async function osmGeocode(q: string): Promise<Point | null> {
  // Política de uso de Nominatim: máximo 1 consulta por segundo
  const wait = lastOsm + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastOsm = Date.now();
  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.searchParams.set("format", "jsonv2");
  u.searchParams.set("limit", "1");
  u.searchParams.set("countrycodes", "cl");
  u.searchParams.set("q", q);
  const res = await fetch(u, { headers: { "User-Agent": "MUVEO-reparto/1.0", "Accept-Language": "es" }, cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as { lat: string; lon: string }[];
  if (!data[0]) return null;
  return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
}

async function googleGeocode(q: string): Promise<Point | null> {
  const u = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  u.searchParams.set("address", q);
  u.searchParams.set("region", "cl");
  u.searchParams.set("components", "country:CL");
  u.searchParams.set("key", KEY());
  const res = await fetch(u, { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as { status: string; results: { geometry: { location: Point } }[] };
  return data.status === "OK" && data.results[0] ? data.results[0].geometry.location : null;
}

/** Coordenadas de una dirección en Santiago. */
export async function geocode(address: string, comuna?: string | null): Promise<Point & { source: GeoSource }> {
  const q = [address, comuna && !address.includes(comuna) ? comuna : null, "Región Metropolitana, Chile"].filter(Boolean).join(", ");
  try {
    const p = hasGoogleMaps() ? await googleGeocode(q) : await osmGeocode(q);
    if (p && inRM(p)) return { ...p, source: hasGoogleMaps() ? "google" : "osm" };
  } catch (e) {
    console.warn("[geocode]", e);
  }
  return { ...comunaCenter(comuna), source: "comuna" };
}

// -------------------------------------------------------------
// Matriz de tiempos de viaje
// -------------------------------------------------------------
export type TravelMatrix = { dur: number[][]; dist: number[][]; factor: (t: number) => number; source: "google" | "estimado" };

async function googleMatrix(points: Point[], departure: Date | null) {
  const n = points.length;
  const dur = points.map(() => new Array<number>(n).fill(0));
  const dist = points.map(() => new Array<number>(n).fill(0));
  const B = 25; // 25 × 25 = 625 elementos, el máximo con tráfico
  const wp = (p: Point) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } });
  for (let oi = 0; oi < n; oi += B) {
    for (let di = 0; di < n; di += B) {
      const origins = points.slice(oi, oi + B);
      const destinations = points.slice(di, di + B);
      const res = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": KEY(),
          "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition",
        },
        body: JSON.stringify({
          origins: origins.map(wp),
          destinations: destinations.map(wp),
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
          ...(departure && departure.getTime() > Date.now() + 60_000 ? { departureTime: departure.toISOString() } : {}),
        }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Routes API ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const rows = (await res.json()) as { originIndex: number; destinationIndex: number; duration?: string; distanceMeters?: number; condition?: string }[];
      for (const r of rows) {
        if (r.condition && r.condition !== "ROUTE_EXISTS") continue;
        const i = oi + r.originIndex, j = di + r.destinationIndex;
        dur[i][j] = parseInt(r.duration ?? "0", 10) || 0;
        dist[i][j] = r.distanceMeters ?? 0;
      }
    }
  }
  return { dur, dist };
}

/**
 * Tiempos y distancias entre todos los puntos.
 * departureSeconds: hora local de salida (para escalar el tráfico del resto del día).
 */
export async function travelMatrix(points: Point[], departure: Date | null, departureSeconds: number): Promise<TravelMatrix> {
  if (hasGoogleMaps() && points.length > 1) {
    try {
      const m = await googleMatrix(points, departure);
      // Rellena pares sin ruta con la estimación
      const est = estimatedMatrix(points);
      for (let i = 0; i < points.length; i++)
        for (let j = 0; j < points.length; j++)
          if (i !== j && !m.dur[i][j]) {
            m.dur[i][j] = est.dur[i][j];
            m.dist[i][j] = est.dist[i][j];
          }
      // Google entrega el tráfico de la hora de salida; el resto del día se ajusta en proporción
      const base = trafficFactor(departureSeconds);
      return { ...m, factor: (t) => trafficFactor(t) / base, source: "google" };
    } catch (e) {
      console.warn("[rutas] Routes API falló, uso estimación", e);
    }
  }
  return { ...estimatedMatrix(points), factor: trafficFactor, source: "estimado" };
}
