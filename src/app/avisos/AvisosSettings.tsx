"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/Icon";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type PushState = "unsupported" | "off" | "on" | "denied" | "busy";

/** Encender/apagar avisos y las notificaciones del teléfono. */
export function AvisosSettings({ userId, initialOn, vapidKey }: { userId: string; initialOn: boolean; vapidKey: string | null }) {
  const [on, setOn] = useState(initialOn);
  const [push, setPush] = useState<PushState>("unsupported");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    (async () => {
      if (Notification.permission === "denied") return setPush("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setPush(sub ? "on" : "off");
    })().catch(() => {});
  }, [vapidKey]);

  async function toggle() {
    const next = !on;
    setOn(next);
    const { error } = await createClient().from("profiles").update({ notify_matches: next }).eq("id", userId);
    if (error) {
      setOn(!next);
      setMsg("No se pudo guardar");
    }
  }

  async function enablePush() {
    if (!vapidKey) return;
    setPush("busy");
    setMsg(null);
    try {
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPush(permission === "denied" ? "denied" : "off");
        return;
      }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
      const res = await fetch("/api/avisos/suscribir", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error();
      setPush("on");
      setMsg("Listo: te llegarán al teléfono");
    } catch {
      setPush("off");
      setMsg("No se pudieron activar. En iPhone, primero agrega la app a tu pantalla de inicio.");
    }
  }

  async function disablePush() {
    setPush("busy");
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/avisos/suscribir", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    setPush("off");
  }

  return (
    <section className="space-y-4 rounded-card border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <Icon name={on ? "bell" : "bellOff"} className="h-6 w-6" />
        <div className="flex-1">
          <p className="font-bold">Avisarme cuando llegue algo para mí</p>
          <p className="text-sm text-muted">Como mucho uno al día, solo si de verdad calza contigo.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Avisos de productos nuevos"
          onClick={toggle}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-brand" : "bg-border"}`}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
        </button>
      </div>

      {on && push !== "unsupported" && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          {push === "on" ? (
            <>
              <p className="flex-1 text-sm font-bold">Te llegan al teléfono o navegador</p>
              <button type="button" onClick={disablePush} className="text-sm font-bold text-muted underline">
                Desactivar
              </button>
            </>
          ) : push === "denied" ? (
            <p className="text-sm text-muted">
              Bloqueaste las notificaciones para este sitio. Puedes activarlas en la configuración del navegador.
            </p>
          ) : (
            <>
              <p className="flex-1 text-sm">¿Quieres que también te lleguen al teléfono?</p>
              <button
                type="button"
                onClick={enablePush}
                disabled={push === "busy"}
                className="rounded-full bg-foreground px-4 py-2 text-sm font-extrabold text-background disabled:opacity-50"
              >
                {push === "busy" ? "Activando…" : "Activar notificaciones"}
              </button>
            </>
          )}
        </div>
      )}
      {msg && <p className="text-sm text-muted">{msg}</p>}
    </section>
  );
}
