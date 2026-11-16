"use client";

import { useActionState } from "react";
import { setCookieConsentRequired, type CookieSwitchState } from "./cookie-actions";

/** Interruptor del aviso de cookies: encenderlo cuando entre en vigencia la Ley 21.719. */
export function CookieSwitch({ enabled, missing }: { enabled: boolean; missing: boolean }) {
  const [state, action, pending] = useActionState<CookieSwitchState, FormData>(setCookieConsentRequired, {});
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 md:p-6">
      <form
        action={action}
        onSubmit={(e) => {
          const msg = enabled
            ? "¿Apagar el aviso de cookies? Google, Meta y TikTok volverán a medir a todos los visitantes sin preguntar."
            : "¿Encender el aviso de cookies? Los visitantes verán Aceptar / Rechazar y solo se medirá a quien acepte.";
          if (!window.confirm(msg)) e.preventDefault();
        }}
        className="space-y-2"
      >
        <input type="hidden" name="enabled" value={enabled ? "0" : "1"} />
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-black">Aviso de cookies {enabled ? "encendido" : "apagado"}</p>
            <p className="text-sm text-muted">
              {enabled
                ? "Los visitantes eligen Aceptar o Rechazar. Google, Meta y TikTok miden solo a quien acepta."
                : "Google, Meta y TikTok miden a todos sin preguntar. Enciéndelo cuando entre en vigencia la Ley 21.719 (1 de diciembre de 2026)."}
            </p>
          </div>
          <button
            disabled={pending || missing}
            role="switch"
            aria-checked={enabled}
            aria-label="Aviso de cookies"
            className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-60 ${enabled ? "bg-accent" : "bg-border"}`}
          >
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${enabled ? "left-7" : "left-1"}`} />
          </button>
        </div>
        {missing && (
          <p className="text-sm font-bold">
            Para usarlo, corre en Supabase (SQL Editor) el archivo supabase/migrations/20261116150000_aviso_cookies.sql.
          </p>
        )}
        {state.ok && <p className="text-sm font-bold text-accent">{state.ok}</p>}
        {state.error && <p className="text-sm font-bold text-pass">{state.error}</p>}
      </form>
    </section>
  );
}
