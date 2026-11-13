"use client";

import { useEffect, useState } from "react";

function format(ms: number) {
  if (ms <= 0) return "terminó";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Cuenta regresiva de una oferta relámpago. */
export function FlashCountdown({ until, className = "" }: { until: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-flash px-2.5 py-1 text-xs font-extrabold text-flash-text ${className}`}
    >
      ⚡ Oferta relámpago {now != null && <span className="tabular-nums">· {format(new Date(until).getTime() - now)}</span>}
    </span>
  );
}
