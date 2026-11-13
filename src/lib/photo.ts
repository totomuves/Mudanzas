"use client";

/**
 * Procesamiento de fotos de productos en el navegador:
 * - achica las fotos del celular,
 * - quita el fondo con IA y lo deja blanco (estilo catálogo).
 */

export type BgProvider = "local" | "removebg" | "off";

async function loadBitmap(src: Blob) {
  return createImageBitmap(src);
}

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/webp", quality = 0.85) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo procesar la foto"))), type, quality),
  );
}

/** Reduce la foto al tamaño máximo y la convierte a WebP. */
export async function compress(src: Blob, maxSize = 1600): Promise<Blob> {
  const bitmap = await loadBitmap(src);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas);
}

/**
 * Pone un recorte con transparencia sobre fondo blanco, centrado en un
 * cuadrado con margen (como las fotos de una tienda).
 */
export async function placeOnWhite(cutout: Blob, size = 1400, margin = 0.08): Promise<Blob> {
  const bitmap = await loadBitmap(cutout);
  // Encuentra el borde del objeto (píxeles no transparentes)
  const probe = document.createElement("canvas");
  probe.width = bitmap.width;
  probe.height = bitmap.height;
  const pctx = probe.getContext("2d", { willReadFrequently: true })!;
  pctx.drawImage(bitmap, 0, 0);
  const { data, width, height } = pctx.getImageData(0, 0, probe.width, probe.height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    // No detectó nada: deja la imagen completa
    minX = 0; minY = 0; maxX = width - 1; maxY = height - 1;
  }
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const inner = size * (1 - margin * 2);
  const scale = Math.min(inner / w, inner / h);

  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(probe, minX, minY, w, h, (size - w * scale) / 2, (size - h * scale) / 2, w * scale, h * scale);
  return canvasToBlob(out, "image/webp", 0.88);
}

/**
 * Quita el fondo y lo deja blanco.
 * - "local": IA en el navegador, gratis (la primera vez descarga el modelo, ~40 MB).
 * - "removebg": servicio remove.bg (requiere REMOVE_BG_API_KEY en el servidor).
 */
export async function whiteBackground(
  file: Blob,
  provider: BgProvider,
  onProgress?: (msg: string) => void,
): Promise<Blob> {
  // Achicar primero hace todo mucho más rápido
  const small = await compress(file, 1280);

  if (provider === "removebg") {
    onProgress?.("Quitando fondo…");
    const fd = new FormData();
    fd.append("image", small, "foto.webp");
    const res = await fetch("/api/admin/quitar-fondo", { method: "POST", body: fd });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "No se pudo quitar el fondo");
    return compress(await res.blob());
  }

  onProgress?.("Preparando IA…");
  const { removeBackground } = await import("@imgly/background-removal");
  const cutout = await removeBackground(small, {
    model: "isnet_fp16",
    output: { format: "image/png" },
    progress: (key: string, current: number, total: number) => {
      if (key.startsWith("fetch") && total > 0) {
        onProgress?.(`Descargando IA (solo la primera vez)… ${Math.round((current / total) * 100)}%`);
      } else if (key.startsWith("compute")) {
        onProgress?.("Quitando fondo…");
      }
    },
  });
  onProgress?.("Dejando fondo blanco…");
  return placeOnWhite(cutout);
}
