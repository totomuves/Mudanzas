"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { anyTracking, isStaffPath } from "@/lib/marketing/config";
import { getConsent, openConsentBanner, setConsent, subscribeConsent, subscribeOpenBanner } from "@/lib/marketing/consent";

/** "server" mientras se arma la página: así el aviso no parpadea al cargar. */
const useConsentState = () =>
  useSyncExternalStore(subscribeConsent, () => getConsent() ?? "none", () => "server" as const);

/**
 * Aviso de cookies: aparece abajo hasta que el visitante elige.
 * "Aceptar" y "Rechazar" tienen el mismo tamaño y peso, como pide la ley.
 * Se puede volver a abrir desde "Preferencias de cookies" en el pie de página.
 * Solo aparece con el interruptor encendido en Admin → Portada.
 */
export function CookieBanner({ required }: { required: boolean }) {
  const pathname = usePathname();
  const consent = useConsentState();
  const [reopened, setReopened] = useState(false);

  useEffect(() => subscribeOpenBanner(() => setReopened(true)), []);

  if (!required || !anyTracking || isStaffPath(pathname) || consent === "server") return null;
  if (consent !== "none" && !reopened) return null;

  const choose = (c: "granted" | "denied") => {
    setConsent(c);
    setReopened(false);
  };

  return (
    <section
      aria-labelledby="cookies-title"
      className="fixed inset-x-3 z-40 mx-auto max-w-md rounded-card border border-border bg-card p-5 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] shadow-[0_8px_30px_rgba(18,18,18,0.12)] md:inset-x-auto md:bottom-5 md:left-5"
    >
      <div className="mb-3 h-1 w-12 rounded-full bg-gradient-to-r from-brand via-brand-2 to-accent" aria-hidden />
      <h2 id="cookies-title" className="text-base font-black">
        Tu privacidad
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">
        Usamos cookies necesarias para que funcionen tu sesión y el carrito. Si aceptas, también usaremos cookies de Google, Meta
        y TikTok para medir las visitas y mostrarte anuncios de nuestros productos. Puedes cambiar tu elección cuando quieras en
        el pie de página.{" "}
        <Link href="/privacidad#cookies" className="font-semibold text-brand underline underline-offset-2">
          Más información
        </Link>
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => choose("denied")}
          className="rounded-full border-2 border-foreground bg-card px-4 py-2.5 text-sm font-bold hover:bg-surface"
        >
          Rechazar
        </button>
        <button
          type="button"
          onClick={() => choose("granted")}
          className="rounded-full border-2 border-foreground bg-card px-4 py-2.5 text-sm font-bold hover:bg-surface"
        >
          Aceptar
        </button>
      </div>
    </section>
  );
}

/** Link del pie de página para volver a elegir. */
export function CookiePreferencesButton({ className, required }: { className?: string; required: boolean }) {
  if (!required || !anyTracking) return null;
  return (
    <button
      type="button"
      onClick={openConsentBanner}
      className={className}
    >
      Preferencias de cookies
    </button>
  );
}
