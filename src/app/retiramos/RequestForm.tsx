"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { requestPickup, type RequestState } from "./actions";

/** Achica la foto a JPEG para que suba rápido desde el celular. */
async function toJpeg(file: File, max = 1280): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob((b) => r(b ?? file), "image/jpeg", 0.8));
}

const input = "w-full rounded-xl border border-border bg-card px-4 py-3";

export function RequestForm({ comunas }: { comunas: readonly string[] }) {
  const [state, action, pending] = useActionState<RequestState, FormData>(requestPickup, {});
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);

  async function addPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])].slice(0, 4 - photos.length);
    const next = await Promise.all(files.map(async (f) => {
      const blob = await toJpeg(f);
      return { blob, url: URL.createObjectURL(blob) };
    }));
    setPhotos((p) => [...p, ...next].slice(0, 4));
    e.target.value = "";
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalError(null);
    if (!photos.length) return setLocalError("Sube al menos una foto.");
    const fd = new FormData(e.currentTarget);
    fd.delete("photos");
    photos.forEach((p, i) => fd.append("photos", new File([p.blob], `foto-${i + 1}.jpg`, { type: "image/jpeg" })));
    startTransition(() => action(fd));
  }

  if (state.ok) {
    return (
      <div className="space-y-3 rounded-card border border-border bg-card p-6 text-center">
        <Icon name="ok" className="mx-auto h-12 w-12 text-accent" strokeWidth={1.6} />
        <p className="text-xl font-black">¡Recibimos tu solicitud!</p>
        <p className="text-muted">Revisamos las fotos y te escribimos por WhatsApp para confirmar el día del retiro.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

      <section className="space-y-2">
        <p className="font-extrabold">1. Fotos de lo que quieres que retiremos</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {photos.map((p, i) => (
            <div key={p.url} className="relative aspect-square overflow-hidden rounded-2xl bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
              <button type="button" aria-label="Quitar foto" onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))} className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white">
                <Icon name="x" className="h-4 w-4" />
              </button>
            </div>
          ))}
          {photos.length < 4 && (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border bg-surface text-muted">
              <Icon name="camera" className="h-8 w-8" strokeWidth={1.5} />
              <span className="text-sm font-bold">{photos.length ? "Otra foto" : "Agregar foto"}</span>
              <input type="file" accept="image/*" multiple onChange={addPhotos} className="sr-only" />
            </label>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <p className="font-extrabold">2. ¿Qué es?</p>
        <textarea name="items" required rows={2} maxLength={300} placeholder="Ej: sofá de 3 cuerpos, una mesa de centro y 2 lámparas" className={input} />
      </section>

      <section className="space-y-2">
        <p className="font-extrabold">3. ¿Dónde pasamos?</p>
        <input name="address" required placeholder="Calle, número y depto" autoComplete="street-address" className={input} />
        <div className="grid grid-cols-2 gap-2">
          <select name="comuna" required defaultValue="" className={input} aria-label="Comuna">
            <option value="">Comuna</option>
            {comunas.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select name="slot" defaultValue="cualquiera" className={input} aria-label="Horario">
            <option value="cualquiera">Cualquier hora</option>
            <option value="manana">Mañana</option>
            <option value="tarde">Tarde</option>
          </select>
        </div>
        <input name="address_notes" maxLength={200} placeholder="Indicaciones (piso, ascensor, portería…)" className={input} />
      </section>

      <section className="space-y-2">
        <p className="font-extrabold">4. Tus datos</p>
        <input name="name" required placeholder="Nombre" autoComplete="name" className={input} />
        <div className="grid grid-cols-2 gap-2">
          <input name="phone" required type="tel" placeholder="WhatsApp" autoComplete="tel" className={input} />
          <input name="email" type="email" placeholder="Correo (opcional)" autoComplete="email" className={input} />
        </div>
      </section>

      <label className="flex cursor-pointer gap-3 rounded-2xl border-2 border-border bg-surface p-3 text-sm">
        <input type="checkbox" name="good_condition" required className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]" />
        <span><b>Confirmo que está en buen estado y funcionando.</b> Si al retirarlo no lo está, el chofer puede no llevárselo.</span>
      </label>

      {(localError || state.error) && <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{localError ?? state.error}</p>}
      <button disabled={pending} className="w-full rounded-full bg-brand py-4 text-lg font-extrabold text-white disabled:opacity-60">
        {pending ? "Enviando…" : "Enviar solicitud"}
      </button>
      <p className="text-center text-xs text-muted">Sin costo para ti. Te confirmamos por WhatsApp si podemos retirarlo y qué día pasamos.</p>
    </form>
  );
}
