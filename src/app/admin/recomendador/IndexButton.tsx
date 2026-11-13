"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Analiza todos los productos pendientes, de a 10 por vez. */
export function IndexButton({ pending }: { pending: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    let total = 0;
    try {
      for (let i = 0; i < 50; i++) {
        const res = await fetch("/api/recomendador/indexar", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ limit: 10 }),
        });
        const json = (await res.json()) as { ok?: boolean; done?: number; failed?: string[]; error?: string; skipped?: string };
        if (!json.ok) throw new Error(json.error ?? json.skipped ?? "Error");
        total += json.done ?? 0;
        setMsg(`Analizados: ${total}…`);
        if (!json.done) break;
      }
      setMsg(`Listo: ${total} productos analizados.`);
    } catch (e) {
      setMsg(`No se pudo terminar: ${e instanceof Error ? e.message : "error"}`);
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={run}
        disabled={busy}
        className="rounded-full bg-foreground px-5 py-2.5 text-sm font-extrabold text-background disabled:opacity-50"
      >
        {busy ? "Analizando…" : pending > 0 ? "Analizar pendientes ahora" : "Revisar de nuevo"}
      </button>
      {msg && <span className="text-sm text-muted">{msg}</span>}
    </div>
  );
}
