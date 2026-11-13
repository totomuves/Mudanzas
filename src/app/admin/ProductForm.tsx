"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { COMUNAS } from "@/lib/comunas";
import { CONDITION_LABEL } from "@/lib/format";
import type { Category, Condition, Product } from "@/lib/types";
import { compress, rotate, whiteBackground, type BgProvider } from "@/lib/photo";
import { Icon } from "@/components/Icon";
import { requestIndexing } from "@/lib/recsys/track";

const MAX_PHOTOS = 6;
const STORAGE_PREFIX = "/storage/v1/object/public/products/";

/** Ruta dentro del bucket a partir de la URL pública (o null si no es nuestra). */
function storagePath(url: string) {
  const i = url.indexOf(STORAGE_PREFIX);
  return i >= 0 ? decodeURIComponent(url.slice(i + STORAGE_PREFIX.length).split("?")[0]) : null;
}

export function ProductForm({
  categories,
  product,
  ai,
  sellerId = null,
  basePath = "/admin",
}: {
  categories: Category[];
  product?: Product;
  ai: { bgProvider: BgProvider; suggest: boolean };
  /** Si lo sube un vendedor: sus fotos van a sellers/<id>/ y el producto queda a su nombre. */
  sellerId?: string | null;
  /** A dónde volver al guardar ("/admin" o "/vendedor"). */
  basePath?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [images, setImages] = useState<string[]>(product?.images ?? []);
  // Fotos ya guardadas en el producto que se quitaron: se borran del almacenamiento al guardar
  const [removedSaved, setRemovedSaved] = useState<string[]>([]);
  const [busyPhoto, setBusyPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [whiteBg, setWhiteBg] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Recuerda la preferencia de fondo blanco en este dispositivo
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem("totomuves.whiteBg") === "0") setWhiteBg(false);
    } catch {}
  }, []);
  function toggleWhiteBg(v: boolean) {
    setWhiteBg(v);
    try {
      localStorage.setItem("totomuves.whiteBg", v ? "1" : "0");
    } catch {}
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flashOn, setFlashOn] = useState(
    Boolean(product?.flash_price && product.flash_until && new Date(product.flash_until) > new Date()),
  );

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS - images.length);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const [i, file] of files.entries()) {
        const label = files.length > 1 ? `Foto ${i + 1}/${files.length}: ` : "";
        let blob: Blob;
        if (whiteBg && ai.bgProvider !== "off") {
          try {
            blob = await whiteBackground(file, ai.bgProvider, (m) => setProgress(label + m));
          } catch (err) {
            console.error(err);
            setError("No se pudo quitar el fondo, subimos la foto original.");
            blob = await compress(file);
          }
        } else {
          setProgress(label + "Subiendo…");
          blob = await compress(file);
        }
        setProgress(label + "Subiendo…");
        const url = await uploadBlob(blob);
        setImages((imgs) => [...imgs, url]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error subiendo fotos");
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  /** Pide a la IA título, descripción, categoría y precio a partir de la portada. */
  async function suggest() {
    if (!images[0] || !formRef.current) return;
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sugerir", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageUrl: images[0] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo sugerir");
      const form = formRef.current;
      const setField = (name: string, value: string | number | null) => {
        const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
        if (el && value != null) el.value = String(value);
      };
      setField("title", data.title);
      setField("description", data.description);
      setField("category_slug", data.category_slug);
      setField("condition", data.condition);
      setField("price", data.price);
      setField("original_price", data.original_price);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo sugerir");
    } finally {
      setSuggesting(false);
    }
  }

  async function uploadBlob(blob: Blob) {
    const path = `${sellerId ? `sellers/${sellerId}/` : ""}${crypto.randomUUID()}.webp`;
    const { error } = await supabase.storage.from("products").upload(path, blob, {
      contentType: "image/webp",
      cacheControl: "31536000",
    });
    if (error) throw error;
    return supabase.storage.from("products").getPublicUrl(path).data.publicUrl;
  }

  /** Saca la foto de la lista y la borra del almacenamiento (si aún no estaba guardada). */
  async function discard(url: string) {
    if (product?.images.includes(url)) {
      setRemovedSaved((r) => [...r, url]);
    } else {
      const path = storagePath(url);
      if (path) await supabase.storage.from("products").remove([path]);
    }
  }

  async function removePhoto(url: string) {
    setImages((imgs) => imgs.filter((x) => x !== url));
    await discard(url);
  }

  async function rotatePhoto(url: string) {
    setBusyPhoto(url);
    setError(null);
    try {
      const blob = await (await fetch(url, { cache: "no-store" })).blob();
      const newUrl = await uploadBlob(await rotate(blob));
      setImages((imgs) => imgs.map((x) => (x === url ? newUrl : x)));
      await discard(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo girar la foto");
    } finally {
      setBusyPhoto(null);
    }
  }

  function move(i: number, dir: -1 | 1) {
    setImages((imgs) => {
      const next = [...imgs];
      const j = i + dir;
      if (j < 0 || j >= next.length) return imgs;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => {
      const v = String(f.get(k) ?? "").replace(/\D/g, "");
      return v ? parseInt(v, 10) : null;
    };
    const flashHours = Number(f.get("flash_hours") ?? 24);
    const payload = {
      title: String(f.get("title") ?? "").trim(),
      description: String(f.get("description") ?? "").trim(),
      category_slug: String(f.get("category_slug")),
      condition: String(f.get("condition")) as Condition,
      comuna: String(f.get("comuna") ?? "") || null,
      price: num("price") ?? 0,
      quantity: num("quantity") ?? 1,
      original_price: num("original_price"),
      status: String(f.get("status") ?? "available"),
      images,
      flash_price: flashOn ? num("flash_price") : null,
      flash_until: flashOn
        ? product?.flash_until && f.get("flash_keep") === "on"
          ? product.flash_until
          : new Date(Date.now() + flashHours * 3600_000).toISOString()
        : null,
    };
    if (payload.title.length < 2) return setError("Ponle un título.");
    if (flashOn && (payload.flash_price == null || payload.flash_price >= payload.price)) {
      return setError("El precio relámpago debe ser menor al precio normal.");
    }

    setSaving(true);
    setError(null);
    const res = product
      ? await supabase.from("products").update(payload).eq("id", product.id)
      : await supabase.from("products").insert(sellerId ? { ...payload, seller_id: sellerId } : payload);
    if (res.error) {
      setSaving(false);
      return setError(res.error.message);
    }
    // Borra del almacenamiento las fotos que se quitaron del producto
    const paths = removedSaved.map(storagePath).filter((x): x is string => Boolean(x));
    if (paths.length) await supabase.storage.from("products").remove(paths);
    // El recomendador analiza el producto (estilo, material, huella) en segundo plano
    requestIndexing(product ? [product.id] : undefined);
    router.push(basePath);
    router.refresh();
  }

  async function onDelete() {
    if (!product) return;
    if (!window.confirm("¿Eliminar este producto? No se puede deshacer.")) return;
    const { error } = await supabase.from("products").delete().eq("id", product.id);
    if (error) {
      setError(
        error.code === "23503"
          ? "Tiene pedidos asociados: mejor cámbialo a «Oculto»."
          : error.message,
      );
      return;
    }
    const paths = [...product.images, ...images, ...removedSaved]
      .map(storagePath)
      .filter((x): x is string => Boolean(x));
    if (paths.length) await supabase.storage.from("products").remove([...new Set(paths)]);
    router.push(basePath);
    router.refresh();
  }

  const input = "w-full rounded-xl border border-border bg-card px-4 py-3";

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-5">
      <section className="space-y-3">
        {images.length < MAX_PHOTOS && (
          <div className="grid grid-cols-2 gap-3">
            <label
              className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-card bg-brand p-5 text-center font-extrabold text-white shadow-lg active:scale-95 ${uploading ? "pointer-events-none opacity-60" : ""}`}
            >
              <Icon name="camera" className="h-9 w-9" strokeWidth={1.8} />
              Tomar foto
              <input type="file" accept="image/*" capture="environment" onChange={onFiles} className="sr-only" disabled={uploading} />
            </label>
            <label
              className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-card border-2 border-border bg-card p-5 text-center font-extrabold active:scale-95 ${uploading ? "pointer-events-none opacity-60" : ""}`}
            >
              <Icon name="imagePlus" className="h-9 w-9" strokeWidth={1.8} />
              Desde la galería
              <input type="file" accept="image/*" multiple onChange={onFiles} className="sr-only" disabled={uploading} />
            </label>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={whiteBg} onChange={(e) => toggleWhiteBg(e.target.checked)} />
          <Icon name="wand" className="h-4 w-4" strokeWidth={2.2} />
          Quitar el fondo y dejarlo blanco con IA
        </label>
        {progress && (
          <p className="animate-pulse rounded-xl bg-brand/10 p-3 text-sm font-bold text-brand">{progress}</p>
        )}

        {images.length > 0 && (
          <>
            <p className="text-sm font-bold text-muted">
              Fotos ({images.length}/{MAX_PHOTOS}) · la primera es la portada
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {images.map((src, i) => (
                <div key={src} className="relative aspect-square overflow-hidden rounded-xl bg-white ring-1 ring-border">
                  <Image src={src} alt="" fill sizes="160px" className={`object-contain ${busyPhoto === src ? "opacity-40" : ""}`} />
                  {i === 0 && (
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[10px] font-bold text-white">Portada</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removePhoto(src)}
                    aria-label="Eliminar foto"
                    title="Eliminar foto"
                    className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-pass text-white shadow"
                  >
                    <Icon name="trash" className="h-4 w-4" strokeWidth={2.2} />
                  </button>
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/55 text-sm text-white [&>button]:flex [&>button]:justify-center [&>button:disabled]:opacity-30">
                    <button type="button" className="flex-1 py-1.5" onClick={() => move(i, -1)} aria-label="Mover a la izquierda" disabled={i === 0}>
                      <Icon name="back" className="h-4 w-4" strokeWidth={2.4} />
                    </button>
                    <button type="button" className="flex-1 py-1.5" onClick={() => rotatePhoto(src)} aria-label="Girar foto" title="Girar" disabled={busyPhoto !== null}>
                      <Icon name="rotate" className="h-4 w-4" strokeWidth={2.4} />
                    </button>
                    <button type="button" className="flex-1 py-1.5" onClick={() => move(i, 1)} aria-label="Mover a la derecha" disabled={i === images.length - 1}>
                      <Icon name="arrow" className="h-4 w-4" strokeWidth={2.4} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {ai.suggest && (
              <button
                type="button"
                onClick={suggest}
                disabled={suggesting || uploading}
                className="flex w-full items-center justify-center gap-2 rounded-full border-2 border-foreground py-3 font-extrabold disabled:opacity-50"
              >
                <Icon name="sparkle" className="h-5 w-5" strokeWidth={2} />
                {suggesting ? "Mirando la foto…" : "Completar título, descripción y precio con IA"}
              </button>
            )}
          </>
        )}
      </section>

      <label className="block space-y-1">
        <span className="font-bold">Título</span>
        <input name="title" defaultValue={product?.title} required maxLength={120} className={input} placeholder="Ej: Sofá 3 cuerpos gris" />
      </label>
      <label className="block space-y-1">
        <span className="font-bold">Descripción</span>
        <textarea name="description" defaultValue={product?.description} rows={4} className={input} placeholder="Medidas, estado, detalles…" />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="font-bold">Categoría</span>
          <select name="category_slug" defaultValue={product?.category_slug ?? categories[0]?.slug} className={input}>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="font-bold">Estado</span>
          <select name="condition" defaultValue={product?.condition ?? "buen_estado"} className={input}>
            {Object.entries(CONDITION_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="font-bold">Precio (CLP)</span>
          <input name="price" inputMode="numeric" defaultValue={product?.price} required className={input} placeholder="35000" />
        </label>
        <label className="block space-y-1">
          <span className="font-bold">Cantidad (unidades)</span>
          <input name="quantity" type="number" min={0} max={999} defaultValue={product?.quantity ?? 1} required className={input} />
        </label>
        <label className="block space-y-1">
          <span className="font-bold">Precio original nuevo (opcional)</span>
          <input name="original_price" inputMode="numeric" defaultValue={product?.original_price ?? ""} className={input} placeholder="89990" />
        </label>
        <label className="block space-y-1">
          <span className="font-bold">Comuna donde está</span>
          <select name="comuna" defaultValue={product?.comuna ?? ""} className={input}>
            <option value="">—</option>
            {COMUNAS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="font-bold">Publicación</span>
          <select name="status" defaultValue={product?.status ?? "available"} className={input}>
            <option value="available">Disponible</option>
            <option value="hidden">Oculto</option>
            <option value="sold">Agotado / vendido</option>
          </select>
        </label>
      </div>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <label className="flex items-center gap-2 font-bold">
          <input type="checkbox" checked={flashOn} onChange={(e) => setFlashOn(e.target.checked)} />
          <Icon name="zap" className="h-4 w-4 text-brand" strokeWidth={2.2} fill="currentColor" />
          Oferta relámpago
        </label>
        {flashOn && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-bold">Precio relámpago</span>
              <input name="flash_price" inputMode="numeric" defaultValue={product?.flash_price ?? ""} className={input} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-bold">Duración</span>
              <select name="flash_hours" defaultValue="24" className={input}>
                <option value="6">6 horas</option>
                <option value="24">24 horas</option>
                <option value="48">2 días</option>
                <option value="168">1 semana</option>
              </select>
            </label>
            {product?.flash_until && new Date(product.flash_until) > new Date() && (
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="flash_keep" defaultChecked /> Mantener el término actual (
                {new Date(product.flash_until).toLocaleString("es-CL")})
              </label>
            )}
          </div>
        )}
      </section>

      {error && <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{error}</p>}

      <div className="flex gap-3">
        {product && (
          <button type="button" onClick={onDelete} className="rounded-full border-2 border-pass px-5 py-3 font-extrabold text-pass">
            Eliminar
          </button>
        )}
        <button disabled={saving || uploading} className="flex-1 rounded-full bg-brand py-3 text-lg font-extrabold text-white disabled:opacity-60">
          {saving ? "Guardando…" : product ? "Guardar cambios" : "Publicar producto"}
        </button>
      </div>
    </form>
  );
}
