"use client";

import { useEffect } from "react";
import { track } from "@/lib/recsys/track";

/**
 * Mide cuánto rato mira el comprador este producto (solo con la pestaña visible)
 * y se lo cuenta al recomendador al salir. Mirar harto = le interesa.
 */
export function TrackView({ productId }: { productId: string }) {
  useEffect(() => {
    let visibleSince: number | null = document.visibilityState === "visible" ? Date.now() : null;
    let total = 0;
    let sent = false;

    const pause = () => {
      if (visibleSince != null) total += Date.now() - visibleSince;
      visibleSince = null;
    };
    const send = () => {
      if (sent) return;
      pause();
      sent = true;
      // Un vistazo de menos de 1 segundo no dice nada
      if (total >= 1000) track("view", productId, total);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") visibleSince = Date.now();
      else pause();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", send);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", send);
      send();
    };
  }, [productId]);
  return null;
}
