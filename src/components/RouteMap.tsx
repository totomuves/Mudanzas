"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";

export type MapStop = { lat: number; lng: number; seq: number; title: string; status?: string };
/** noLine: puntos sueltos (sin ruta todavía), sin línea ni bodega. */
export type MapRoute = { id: string; color: string; stops: MapStop[]; noLine?: boolean };

/**
 * Mapa de rutas (Leaflet + OpenStreetMap, gratis y sin clave).
 * Bodega en negro, paradas numeradas con el color de su ruta.
 * Las entregadas se ven con check y las fallidas con una X.
 */
export function RouteMap({
  depot,
  routes,
  me,
  className = "h-80",
}: {
  depot: { lat: number; lng: number } | null;
  routes: MapRoute[];
  me?: { lat: number; lng: number } | null;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const key = JSON.stringify({ depot, routes, me });

  useEffect(() => {
    let cancelled = false;
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
      for (const r of routes) {
        const line: [number, number][] = [];
        if (depot && !r.noLine) line.push([depot.lat, depot.lng]);
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
        if (depot && !r.noLine) line.push([depot.lat, depot.lng]);
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
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => () => {
    mapRef.current?.remove();
    mapRef.current = null;
  }, []);

  return <div ref={ref} className={`z-0 w-full overflow-hidden rounded-2xl border border-border bg-surface ${className}`} />;
}
