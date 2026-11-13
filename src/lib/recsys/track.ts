/** Del lado del navegador: avisa al recomendador sin bloquear nada. */
export function track(kind: "view" | "share", productId: string, value?: number) {
  try {
    fetch("/api/recomendador/evento", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, productId, value }),
      keepalive: true, // se envía aunque el usuario cierre o cambie de página
    }).catch(() => {});
  } catch {
    // nada: medir nunca debe romper la app
  }
}

/** Pide analizar productos pendientes (nuevos o editados). */
export function requestIndexing(productIds?: string[]) {
  try {
    fetch("/api/recomendador/indexar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(productIds ? { productIds } : {}),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // nada
  }
}
