import "server-only";
import { hasGoogleMaps, type Point } from "./geo";

/**
 * TRAZADO POR CALLES para dibujar la ruta en el mapa.
 *
 * Con GOOGLE_MAPS_API_KEY: Routes API (computeRoutes), el mismo camino que usa Google.
 * Sin clave: OSRM (servidor público gratis de OpenStreetMap).
 * Si ambos fallan devuelve null y el mapa dibuja líneas rectas.
 */

export type RoadPath = { path: [number, number][]; source: "google" | "osm" };

/** Decodifica el formato "encoded polyline" (precisión 5), que usan Google y OSRM. */
function decode(str: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let shift = 0, result = 0, b: number;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && i < str.length);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += d;
      else lng += d;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

async function googleLeg(pts: Point[]): Promise<[number, number][]> {
  const wp = (p: Point) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY || "",
      "X-Goog-FieldMask": "routes.polyline.encodedPolyline",
    },
    body: JSON.stringify({
      origin: wp(pts[0]),
      destination: wp(pts[pts.length - 1]),
      intermediates: pts.slice(1, -1).map(wp),
      travelMode: "DRIVE",
      // Sin tráfico: es solo para dibujar y cuesta menos
      routingPreference: "TRAFFIC_UNAWARE",
      polylineEncoding: "ENCODED_POLYLINE",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Routes API ${res.status}`);
  const data = (await res.json()) as { routes?: { polyline?: { encodedPolyline?: string } }[] };
  const enc = data.routes?.[0]?.polyline?.encodedPolyline;
  if (!enc) throw new Error("Routes API sin trazado");
  return decode(enc);
}

async function osrmLeg(pts: Point[]): Promise<[number, number][]> {
  const coords = pts.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=polyline`, {
    headers: { "User-Agent": "MUVEO-reparto/1.0" },
    signal: AbortSignal.timeout(12_000),
    // El trazado entre los mismos puntos casi no cambia: se guarda un día
    next: { revalidate: 86_400 },
  });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = (await res.json()) as { code: string; routes?: { geometry: string }[] };
  if (data.code !== "Ok" || !data.routes?.[0]) throw new Error(`OSRM ${data.code}`);
  return decode(data.routes[0].geometry);
}

// Guardado en memoria del servidor para no pedir lo mismo cada vez que se abre la página
const memo = new Map<string, RoadPath>();
const keyOf = (pts: Point[]) => pts.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");

/** Camino por calles que pasa por todos los puntos en orden. */
export async function roadPath(points: Point[]): Promise<RoadPath | null> {
  if (points.length < 2) return null;
  const key = keyOf(points);
  const hit = memo.get(key);
  if (hit) return hit;

  // Google acepta 25 paradas intermedias por consulta; OSRM, unas 100 en total
  const chunk = hasGoogleMaps() ? 27 : 60;
  const legs: Point[][] = [];
  for (let i = 0; i < points.length - 1; i += chunk - 1) legs.push(points.slice(i, i + chunk));

  const run = async (fn: (p: Point[]) => Promise<[number, number][]>) => (await Promise.all(legs.map(fn))).flat();
  let result: RoadPath | null = null;
  if (hasGoogleMaps()) {
    try {
      result = { path: await run(googleLeg), source: "google" };
    } catch (e) {
      console.warn("[trazado] Google falló, pruebo OpenStreetMap", e);
    }
  }
  if (!result) {
    try {
      result = { path: await run(osrmLeg), source: "osm" };
    } catch (e) {
      console.warn("[trazado] OSRM falló, el mapa usa líneas rectas", e);
      return null;
    }
  }
  if (memo.size > 300) memo.delete(memo.keys().next().value!);
  memo.set(key, result);
  return result;
}
