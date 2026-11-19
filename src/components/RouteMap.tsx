"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";

export type MapStop = { lat: number; lng: number; seq: number; title: string; status?: string };
/** noLine: puntos sueltos (sin ruta todavía), sin línea ni bodega. */
/** Parking (P) o bodega (B) por donde pasa la ruta antes o después de las paradas. */
export type MapPlace = { lat: number; lng: number; letter: "P" | "B"; title: string };
export type MapRoute = {
  id: string; color: string; stops: MapStop[]; noLine?: boolean;
  /** Recorrido antes de la primera parada (parking, bodegas de carga). Si viene, reemplaza a la bodega. */
  head?: MapPlace[];
  /** Recorrido después de la última parada (bodega de descarga, parking). */
  tail?: MapPlace[];
};

/**
 * Mapa de rutas (Leaflet + OpenStreetMap, gratis y sin clave).
 * Bodega en negro, paradas numeradas con el color de su ruta.
 * Las entregadas se ven con check y las fallidas con una X.
 */
/** Rutas en curso cuyo vehículo se muestra en vivo (posición que manda el celular del chofer). */
export type LiveVehicle = { routeId: string; name: string; color: string };

const TRUCK_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>';

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (m < 1) return "recién";
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.floor(m / 60)} h ${m % 60} min`;
}

export function RouteMap({
  depot,
  routes,
  me,
  live = [],
  className = "h-80",
}: {
  depot: { lat: number; lng: number } | null;
  routes: MapRoute[];
  me?: { lat: number; lng: number } | null;
  live?: LiveVehicle[];
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const key = JSON.stringify({ depot, routes, me, live });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;
      mapRef.current?.remove();
      const map = L.map(ref.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
      mapRef.current = map;
      // Mapa gratis y sin clave. CARTO empezó a exigir clave (sus mosaicos salían
      // con "API KEY REQUIRED"), así que usamos OpenStreetMap y, si sus mosaicos
      // fallan, cambiamos solos a otro servidor gratuito.
      const osm = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
      const sources = [
        { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: osm },
        { url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", attribution: `${osm} · HOT` },
      ];
      const addTiles = (i: number) => {
        const src = sources[i];
        let errors = 0;
        const layer = L.tileLayer(src.url, { maxZoom: 19, attribution: src.attribution }).addTo(map);
        // Tono suave para que destaquen las rutas de colores
        const el = layer.getContainer();
        if (el) el.style.filter = "grayscale(0.55) contrast(0.95) brightness(1.03)";
        layer.on("tileerror", () => {
          errors += 1;
          if (errors === 4 && i + 1 < sources.length && mapRef.current === map) {
            map.removeLayer(layer);
            addTiles(i + 1);
          }
        });
      };
      addTiles(0);

      const bounds = L.latLngBounds([]);
      const icon = (html: string) => L.divIcon({ html, className: "", iconSize: [28, 28], iconAnchor: [14, 14] });

      if (depot) {
        L.marker([depot.lat, depot.lng], {
          icon: icon(`<div style="width:28px;height:28px;border-radius:8px;background:#121212;color:#fff;display:flex;align-items:center;justify-content:center;font:800 11px system-ui;box-shadow:0 1px 4px #0005">B</div>`),
          title: "Bodega",
        }).addTo(map);
        bounds.extend([depot.lat, depot.lng]);
      }
      const place = (p: MapPlace) => {
        L.marker([p.lat, p.lng], {
          icon: icon(`<div style="width:28px;height:28px;border-radius:8px;background:${p.letter === "P" ? "#5b3fe0" : "#121212"};color:#fff;display:flex;align-items:center;justify-content:center;font:800 11px system-ui;box-shadow:0 1px 4px #0005">${p.letter}</div>`),
          title: p.title,
        })
          .bindTooltip(p.title.replace(/</g, "&lt;"))
          .addTo(map);
        bounds.extend([p.lat, p.lng]);
      };
      for (const r of routes) {
        const line: [number, number][] = [];
        if (r.head?.length) for (const p of r.head) { place(p); if (!r.noLine) line.push([p.lat, p.lng]); }
        else if (depot && !r.noLine) line.push([depot.lat, depot.lng]);
        for (const s of r.stops) {
          line.push([s.lat, s.lng]);
          bounds.extend([s.lat, s.lng]);
          const done = s.status === "entregado";
          const failed = s.status === "fallido";
          const label = done ? "&#10003;" : failed ? "&#10005;" : String(s.seq);
          const bg = failed ? "#e03c31" : r.color;
          L.marker([s.lat, s.lng], {
            icon: icon(
              `<div style="width:28px;height:28px;border-radius:999px;background:${done ? "#fff" : bg};color:${done ? bg : "#fff"};border:2.5px solid ${bg};display:flex;align-items:center;justify-content:center;font:800 12px system-ui;box-shadow:0 1px 4px #0004">${label}</div>`,
            ),
            title: s.title,
          })
            .bindTooltip(`${s.seq}. ${s.title.replace(/</g, "&lt;")}`)
            .addTo(map);
        }
        if (r.tail?.length) for (const p of r.tail) { place(p); if (!r.noLine) line.push([p.lat, p.lng]); }
        else if (depot && !r.noLine) line.push([depot.lat, depot.lng]);
        if (line.length > 1 && !r.noLine) {
          // Primero una línea punteada; cuando llega el camino por calles, se reemplaza
          const pl = L.polyline(line, { color: r.color, weight: 3, opacity: 0.5, dashArray: "6 8" }).addTo(map);
          fetch("/api/rutas/trazado", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ points: line.map(([lat, lng]) => ({ lat, lng })) }),
          })
            .then((res) => (res.ok ? res.json() : null))
            .then((d: { path?: [number, number][] | null } | null) => {
              if (cancelled || mapRef.current !== map || !d?.path || d.path.length < 2) return;
              pl.setLatLngs(d.path);
              pl.setStyle({ weight: 5, opacity: 0.8, dashArray: undefined });
              // Leaflet no borra el punteado con undefined: se quita a mano
              pl.getElement()?.removeAttribute("stroke-dasharray");
            })
            .catch(() => {});
        }
      }
      if (me) {
        L.circleMarker([me.lat, me.lng], { radius: 8, color: "#fff", weight: 3, fillColor: "#2f7fd8", fillOpacity: 1 }).addTo(map);
        bounds.extend([me.lat, me.lng]);
      }
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
      else map.setView([-33.45, -70.66], 11);

      // Vehículos en vivo: se piden cada 30 s y solo se mueven sus íconos
      if (live.length) {
        const layer = L.layerGroup().addTo(map);
        const byId = new Map(live.map((v) => [v.routeId, v]));
        const draw = async () => {
          const res = await fetch(`/api/rutas/posicion?ids=${live.map((v) => v.routeId).join(",")}`, { cache: "no-store" }).catch(() => null);
          const d = res?.ok ? ((await res.json()) as { positions: { routeId: string; lat: number; lng: number; seenAt: string }[] }) : null;
          if (cancelled || !d || mapRef.current !== map) return;
          layer.clearLayers();
          for (const p of d.positions) {
            const v = byId.get(p.routeId);
            if (!v) continue;
            const stale = Date.now() - new Date(p.seenAt).getTime() > 10 * 60_000;
            L.marker([p.lat, p.lng], {
              zIndexOffset: 1000,
              opacity: stale ? 0.55 : 1,
              icon: L.divIcon({
                className: "",
                iconSize: [34, 34],
                iconAnchor: [17, 17],
                html: `<div style="width:34px;height:34px;border-radius:10px;background:${v.color};color:#fff;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 2px 6px #0006">${TRUCK_SVG}</div>`,
              }),
            })
              .bindTooltip(`${v.name.replace(/</g, "&lt;")} · ${stale ? "sin señal " : ""}${ago(p.seenAt)}`, { direction: "top", offset: [0, -16] })
              .addTo(layer);
          }
        };
        void draw();
        timer = setInterval(draw, 30_000);
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => () => {
    mapRef.current?.remove();
    mapRef.current = null;
  }, []);

  return <div ref={ref} className={`z-0 w-full overflow-hidden rounded-2xl border border-border bg-surface ${className}`} />;
}
