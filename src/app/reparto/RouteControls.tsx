"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RouteMap, type MapRoute } from "@/components/RouteMap";
import { reoptimizeFromHere, startRouteAction } from "./actions";

/** Ubicación actual del teléfono (o null si no da permiso). */
export function getPosition(timeout = 8000): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout, maximumAge: 30_000 });
  });
}

export function DriverMap({ depot, routes }: { depot: { lat: number; lng: number } | null; routes: MapRoute[] }) {
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setMe((prev) => {
        // Solo redibuja si se movió más de ~50 m
        const next = { lat: p.coords.latitude, lng: p.coords.longitude };
        if (prev && Math.abs(prev.lat - next.lat) < 0.0005 && Math.abs(prev.lng - next.lng) < 0.0005) return prev;
        return next;
      }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return <RouteMap depot={depot} routes={routes} me={me} className="h-72" />;
}

export function RouteControls({ routeId, status, hasPending }: { routeId: string; status: string; hasPending: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function begin() {
    start(async () => {
      const p = await getPosition();
      await startRouteAction(routeId, p?.coords.latitude, p?.coords.longitude);
      router.refresh();
    });
  }
  function recalc() {
    setMsg(null);
    start(async () => {
      const p = await getPosition();
      const changed = await reoptimizeFromHere(routeId, p?.coords.latitude, p?.coords.longitude);
      setMsg(changed ? "Orden actualizado según tu ubicación y el tráfico." : "El orden actual ya es el mejor.");
      router.refresh();
    });
  }

  if (status === "terminada" || !hasPending) return null;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {status !== "en_curso" ? (
          <button onClick={begin} disabled={pending} className="col-span-2 flex items-center justify-center gap-2 rounded-full bg-brand py-4 text-lg font-extrabold text-white disabled:opacity-60">
            <Icon name="truck" className="h-6 w-6" />
            {pending ? "Iniciando…" : "Iniciar ruta"}
          </button>
        ) : (
          <button onClick={recalc} disabled={pending} className="col-span-2 flex items-center justify-center gap-2 rounded-full border-2 border-border py-3 font-extrabold disabled:opacity-60">
            <Icon name="rotate" className="h-5 w-5" />
            {pending ? "Recalculando…" : "Recalcular desde aquí"}
          </button>
        )}
      </div>
      {status !== "en_curso" && <p className="text-center text-xs text-muted">Al iniciar, al primer comprador le llega el aviso de que van en camino.</p>}
      {msg && <p className="text-center text-sm font-bold text-accent">{msg}</p>}
    </div>
  );
}
