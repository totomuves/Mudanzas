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

export function DriverMap({ depot, routes, routeId, tracking }: { depot: { lat: number; lng: number } | null; routes: MapRoute[]; routeId: string; tracking: boolean }) {
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [sharing, setSharing] = useState<"off" | "on" | "denied">("off");
  useEffect(() => {
    if (!navigator.geolocation) return;
    let lastSent = 0;
    let lastPos: { lat: number; lng: number } | null = null;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude };
        // Solo redibuja si se movió más de ~50 m
        setMe((prev) => (prev && Math.abs(prev.lat - next.lat) < 0.0005 && Math.abs(prev.lng - next.lng) < 0.0005 ? prev : next));
        if (!tracking) return;
        setSharing("on");
        // Envía la posición cada 30 s, o antes (mín. 10 s) si avanzó más de ~100 m
        const now = Date.now();
        const moved = lastPos ? Math.abs(lastPos.lat - next.lat) + Math.abs(lastPos.lng - next.lng) > 0.001 : true;
        if (now - lastSent < 10_000 || (now - lastSent < 30_000 && !moved)) return;
        lastSent = now;
        lastPos = next;
        void fetch("/api/rutas/posicion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ routeId, ...next, accuracy: p.coords.accuracy }),
          keepalive: true,
        }).catch(() => {});
      },
      (e) => { if (e.code === e.PERMISSION_DENIED) setSharing("denied"); },
      { enableHighAccuracy: true, maximumAge: 20_000 },
    );
    // Mantiene la pantalla encendida mientras la ruta está en curso, para que siga enviando la ubicación
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const askLock = () => { if (tracking && document.visibilityState === "visible") nav.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {}); };
    askLock();
    document.addEventListener("visibilitychange", askLock);
    return () => {
      navigator.geolocation.clearWatch(id);
      document.removeEventListener("visibilitychange", askLock);
      void lock?.release().catch(() => {});
    };
  }, [routeId, tracking]);
  return (
    <div className="space-y-1">
      <RouteMap depot={depot} routes={routes} me={me} className="h-72" />
      {tracking && (
        <p className={`flex items-center gap-1.5 text-xs font-bold ${sharing === "denied" ? "text-pass" : "text-muted"}`}>
          <span className={`h-2 w-2 rounded-full ${sharing === "on" ? "bg-accent" : sharing === "denied" ? "bg-pass" : "bg-border"}`} aria-hidden />
          {sharing === "denied"
            ? "Activa la ubicación del navegador para que la oficina vea dónde vas."
            : sharing === "on"
              ? "Compartiendo tu ubicación con la oficina mientras la ruta está en curso."
              : "Buscando tu ubicación…"}
        </p>
      )}
    </div>
  );
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
