"use client";

/**
 * Procesamiento de fotos de productos en el navegador:
 * - achica las fotos del celular,
 * - quita el fondo con IA y lo deja blanco (estilo catálogo).
 */

export type BgProvider = "local" | "removebg" | "off";

type Decoded = { source: CanvasImageSource; width: number; height: number };

/**
 * Decodifica la foto respetando la orientación EXIF del celular.
 * Se usa <img> porque createImageBitmap ignora la orientación en algunos
 * navegadores (por eso a veces salían fotos dadas vuelta).
 */
async function loadBitmap(src: Blob): Promise<Decoded> {
  const url = URL.createObjectURL(src);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } catch {
    const bmp = await createImageBitmap(src, { imageOrientation: "from-image" });
    return { source: bmp, width: bmp.width, height: bmp.height };
  } finally {
    // El objeto URL se libera un rato después, cuando ya se dibujó
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo procesar la foto"))), type, quality),
  );
}

/**
 * Convierte el dibujo en una foto liviana (WebP). Safari (iPhone/iPad/Mac)
 * no sabe crear WebP y en silencio entrega un PNG que pesa 5 a 10 veces más:
 * en ese caso se usa JPEG, que pesa casi lo mismo que WebP.
 */
async function canvasToBlob(canvas: HTMLCanvasElement, type = "image/webp", quality = 0.85) {
  const blob = await encode(canvas, type, quality);
  if (blob.type === type) return blob;
  return encode(canvas, "image/jpeg", Math.min(quality, 0.85));
}

/** Extensión de archivo según el tipo real de la foto procesada. */
export function photoExt(blob: Blob) {
  return blob.type === "image/jpeg" ? "jpg" : blob.type === "image/png" ? "png" : "webp";
}

/** Reduce la foto al tamaño máximo y la convierte a WebP. */
export async function compress(src: Blob, maxSize = 1600): Promise<Blob> {
  const bitmap = await loadBitmap(src);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap.source, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas);
}

/** Gira la foto 90° (a la derecha por defecto) y la devuelve como WebP. */
export async function rotate(src: Blob, clockwise = true): Promise<Blob> {
  const img = await loadBitmap(src);
  const canvas = document.createElement("canvas");
  canvas.width = img.height;
  canvas.height = img.width;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(((clockwise ? 90 : -90) * Math.PI) / 180);
  ctx.drawImage(img.source, -img.width / 2, -img.height / 2);
  return canvasToBlob(canvas, "image/webp", 0.9);
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
  pctx.drawImage(bitmap.source, 0, 0);
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

/** En celulares se usa el modelo liviano (~45 MB en vez de ~90 MB) para que descargue rápido y no se cuelgue. */
function isPhone() {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData?.mobile) return true;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
}

const MB = 1024 * 1024;

/**
 * Corre una tarea con un "perro guardián": si pasan `ms` sin novedades
 * (avance de la descarga o del cálculo), se corta con un mensaje claro en
 * vez de quedarse pegado para siempre.
 */
function withWatchdog<T>(run: (kick: () => void) => Promise<T>, ms: number, message: () => string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const kick = () => {
      clearTimeout(timer);
      timer = setTimeout(() => reject(new Error(message())), ms);
    };
    kick();
    run(kick).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Traduce los errores técnicos de la IA a algo entendible. */
function friendlyAiError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  if (/fetch|network|Failed to fetch|Load failed|resources\.json|publicPath/i.test(raw)) {
    return new Error("No se pudo descargar la IA de fondo blanco. Revisa tu conexión (mejor con Wi-Fi) e inténtalo de nuevo.");
  }
  if (/memory|allocation|Aborted|out of bounds/i.test(raw)) {
    return new Error("Este dispositivo se quedó sin memoria para la IA. Prueba desde un computador o cierra otras apps.");
  }
  return err instanceof Error ? err : new Error(raw);
}

/**
 * Quita el fondo y lo deja blanco.
 * - "local": IA en el navegador, gratis (la primera vez descarga el modelo:
 *   ~45 MB en celular, ~90 MB en computador; después queda guardado).
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
  const model = isPhone() ? "isnet_quint8" : "isnet_fp16";
  // Avance total de la descarga (modelo + motor), en un solo porcentaje
  const files = new Map<string, { current: number; total: number }>();
  let downloading = false;

  const cutout = await withWatchdog(
    async (kick) => {
      const { removeBackground } = await import("@imgly/background-removal");
      kick();
      return removeBackground(small, {
        model,
        output: { format: "image/png" },
        progress: (key: string, current: number, total: number) => {
          kick();
          if (key.startsWith("fetch") && total > 0) {
            downloading = true;
            files.set(key, { current, total });
            let cur = 0, tot = 0;
            for (const f of files.values()) { cur += f.current; tot += f.total; }
            onProgress?.(`Descargando IA (solo la primera vez)… ${Math.round(cur / MB)} de ${Math.round(tot / MB)} MB`);
          } else if (key.startsWith("compute")) {
            onProgress?.("Quitando fondo…");
          }
        },
      });
    },
    // Una parte de la descarga puede tardar en llegar con internet lento
    90_000,
    () =>
      downloading
        ? "La descarga de la IA se quedó pegada. Revisa tu conexión (mejor con Wi-Fi) e inténtalo de nuevo."
        : "La IA de fondo blanco no alcanzó a descargarse. Revisa tu conexión (mejor con Wi-Fi) e inténtalo de nuevo.",
  ).catch((err) => {
    throw friendlyAiError(err);
  });
  onProgress?.("Dejando fondo blanco…");
  return placeOnWhite(cutout);
}
