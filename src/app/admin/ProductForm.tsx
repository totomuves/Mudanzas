"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { COMUNAS } from "@/lib/comunas";
import { CONDITION_LABEL } from "@/lib/format";
import type { Category, Condition, Product } from "@/lib/types";
import { compress, whiteBackground, type BgProvider } from "@/lib/photo";

const MAX_PHOTOS = 6;

export function ProductForm({
  categories,
  product,
  ai,
}: {
  categories: Category[];
  product?: Product;
  ai: { bgProvider: BgProvider; suggest: boolean };
}) {
  const router = useRouter();
  const supabase = createClient();
  const [images, setImages] = useState<string[]>(product?.images ?? []);
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
        const path = `${crypto.randomUUID()}.webp`;
        const { error } = await supabase.storage.from("products").upload(path, blob, {
          contentType: "image/webp",
          cacheControl: "31536000",
        });
        if (error) throw error;
        const { data } = supabase.storage.from("products").getPublicUrl(path);
        setImages((imgs) => [...imgs, data.publicUrl]);
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
      : await supabase.from("products").insert(payload);
    if (res.error) {
      setSaving(false);
      return setError(res.error.message);
    }
    router.push("/admin");
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
    router.push("/admin");
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
              <span className="text-4xl">📷</span>
              Tomar foto
              <input type="file" accept="image/*" capture="environment" onChange={onFiles} className="sr-only" disabled={uploading} />
            </label>
            <label
              className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-card border-2 border-border bg-card p-5 text-center font-extrabold active:scale-95 ${uploading ? "pointer-events-none opacity-60" : ""}`}
            >
              <span className="text-4xl">🖼️</span>
              Desde la galería
              <input type="file" accept="image/*" multiple onChange={onFiles} className="sr-only" disabled={uploading} />
            </label>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={whiteBg} onChange={(e) => toggleWhiteBg(e.target.checked)} />
          ✨ Quitar el fondo y dejarlo blanco con IA
        </label>
        {progress && (
          <p className="animate-pulse rounded-xl bg-brand/10 p-3 text-sm font-bold text-brand">⏳ {progress}</p>
        )}

        {images.length > 0 && (
          <>
            <p className="text-sm font-bold text-muted">
              Fotos ({images.length}/{MAX_PHOTOS}) · la primera es la portada
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {images.map((src, i) => (
                <div key={src} className="relative aspect-square overflow-hidden rounded-xl bg-white ring-1 ring-border">
                  <Image src={src} alt="" fill sizes="120px" className="object-contain" />
                  {i === 0 && (
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[10px] font-bold text-white">Portada</span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 p-1 text-xs text-white">
                    <button type="button" onClick={() => move(i, -1)} aria-label="Mover a la izquierda">◀</button>
                    <button type="button" onClick={() => setImages((imgs) => imgs.filter((x) => x !== src))} aria-label="Quitar">🗑️</button>
                    <button type="button" onClick={() => move(i, 1)} aria-label="Mover a la derecha">▶</button>
                  </div>
                </div>
              ))}
            </div>
            {ai.suggest && (
              <button
                type="button"
                onClick={suggest}
                disabled={suggesting || uploading}
                className="w-full rounded-full border-2 border-brand py-3 font-extrabold text-brand disabled:opacity-50"
              >
                {suggesting ? "Mirando la foto…" : "✨ Completar título, descripción y precio con IA"}
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
              <option key={c.slug} value={c.slug}>{c.emoji} {c.name}</option>
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
          ⚡ Oferta relámpago
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
