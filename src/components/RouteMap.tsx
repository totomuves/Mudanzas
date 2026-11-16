"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";

export type MapStop = { lat: number; lng: number; seq: number; title: string; status?: string };
export type MapRoute = { id: string; color: string; stops: MapStop[] };

/**
 * Mapa de rutas (Leaflet + mapa claro de CARTO/OpenStreetMap).
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
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      }).addTo(map);

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
        if (depot) line.push([depot.lat, depot.lng]);
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
        if (depot) line.push([depot.lat, depot.lng]);
        if (line.length > 1) L.polyline(line, { color: r.color, weight: 4, opacity: 0.75 }).addTo(map);
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
