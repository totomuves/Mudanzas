"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compress, photoExt } from "@/lib/photo";
import { addWork, type WorkState } from "./actions";

const input = "w-full rounded-xl border border-border bg-card px-3 py-2";

/** Subir una foto de un trabajo realizado (sin quitar el fondo: son fotos reales). */
export function WorkForm() {
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [state, action, pending] = useActionState<WorkState, FormData>(async (prev, fd) => {
    const res = await addWork(prev, fd);
    if (res.ok) setImageUrl("");
    return res;
  }, {});

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const blob = await compress(file, 1600);
      const supabase = createClient();
      const path = `trabajos/${crypto.randomUUID()}.${photoExt(blob)}`;
      const { error } = await supabase.storage.from("products").upload(path, blob, {
        contentType: blob.type || "image/webp",
        cacheControl: "31536000",
      });
      if (error) throw error;
      setImageUrl(supabase.storage.from("products").getPublicUrl(path).data.publicUrl);
    } catch {
      setUploadError("No se pudo subir la foto. Si es la primera vez, revisa que esté corrida la migración 20261116130000_trabajos_mudanzas.sql.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={action} className="grid gap-4 md:grid-cols-[220px_1fr]">
      <input type="hidden" name="image_url" value={imageUrl} />
      <label className="relative flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-surface text-sm font-bold text-muted">
        {imageUrl ? (
          <Image src={imageUrl} alt="" fill sizes="220px" className="object-cover" />
        ) : uploading ? (
          "Subiendo…"
        ) : (
          "Elegir foto"
        )}
        <input type="file" accept="image/*" className="sr-only" onChange={onPhoto} disabled={uploading} />
      </label>
      <div className="space-y-3">
        <label className="block space-y-1 text-sm font-bold">
          Título (opcional)
          <input name="title" maxLength={80} placeholder="Departamento 2D, Ñuñoa a Providencia" className={`${input} font-normal`} />
        </label>
        <label className="block space-y-1 text-sm font-bold">
          Detalle (opcional)
          <input name="caption" maxLength={140} placeholder="Embalaje completo y armado de camas" className={`${input} font-normal`} />
        </label>
        {uploadError && <p className="text-sm font-bold text-pass">{uploadError}</p>}
        {state.error && <p className="text-sm font-bold text-pass">{state.error}</p>}
        {state.ok && <p className="text-sm font-bold text-accent">{state.ok}</p>}
        <button disabled={pending || uploading || !imageUrl} className="rounded-full bg-brand px-6 py-3 font-extrabold text-white disabled:opacity-60">
          {pending ? "Guardando…" : "Agregar a la galería"}
        </button>
      </div>
    </form>
  );
}
