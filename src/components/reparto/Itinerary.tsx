import { Icon } from "@/components/Icon";
import { WAYPOINT_LABEL, formatTime, mapsDirections, type RouteWaypoint } from "@/lib/delivery";
import type { MapPlace } from "@/components/RouteMap";

/** Parking y bodegas de una ruta, separados en antes y después de las paradas (para el mapa). */
export function waypointPlaces(waypoints: RouteWaypoint[] | null | undefined): { head?: MapPlace[]; tail?: MapPlace[] } {
  const w = Array.isArray(waypoints) ? waypoints : [];
  if (!w.length) return {};
  const place = (x: RouteWaypoint): MapPlace => ({
    lat: x.lat, lng: x.lng, letter: x.kind === "salida" || x.kind === "llegada" ? "P" : "B",
    title: `${WAYPOINT_LABEL[x.kind]}${x.kind === "carga" || x.kind === "descarga" ? ` ${x.name}` : ` (${x.name})`}`,
  });
  return {
    head: w.filter((x) => x.kind === "salida" || x.kind === "carga").map(place),
    tail: w.filter((x) => x.kind === "descarga" || x.kind === "llegada").map(place),
  };
}

/** Recorrido fijo de la ruta: sale del parking, carga en bodegas, deja retiros y vuelve. */
export function Itinerary({ waypoints, part, links = false }: { waypoints: RouteWaypoint[] | null | undefined; part?: "head" | "tail"; links?: boolean }) {
  const all = Array.isArray(waypoints) ? waypoints : [];
  const w = part === "head"
    ? all.filter((x) => x.kind === "salida" || x.kind === "carga")
    : part === "tail"
      ? all.filter((x) => x.kind === "descarga" || x.kind === "llegada")
      : all;
  if (!w.length) return null;
  return (
    <ol className="space-y-1 text-sm">
      {w.map((x, i) => (
        <li key={`${x.kind}-${i}`} className="flex items-center gap-2">
          <Icon name={x.kind === "salida" || x.kind === "llegada" ? "pin" : "warehouse"} className="h-4 w-4 shrink-0 text-muted" />
          <span className="min-w-0 flex-1">
            <b>{formatTime(x.eta)}</b> · {WAYPOINT_LABEL[x.kind]} {x.kind === "carga" || x.kind === "descarga" ? <b>{x.name}</b> : <span className="text-muted">({x.name})</span>}
          </span>
          {links && (
            <a href={mapsDirections({ lat: x.lat, lng: x.lng })} target="_blank" rel="noreferrer" className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs font-bold">
              Ir
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}
