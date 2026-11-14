"use client";

import { useActionState, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compress, photoExt } from "@/lib/photo";
import { BannerCard } from "@/components/BannerCard";
import type { BannerImageLayout, BannerStyle, HomeBanner } from "@/lib/types";
import { saveBanner, type BannerState } from "./actions";

const STYLE_LABEL: Record<BannerStyle, string> = {
  aurora: "Degradado morado y rosado",
  laguna: "Degradado turquesa y morado",
  pastel: "Degradado pastel",
  suave: "Suave (fondo claro)",
  marca: "Color de la marca",
  oscuro: "Oscuro",
};

const input = "w-full rounded-xl border border-border bg-background px-3 py-2.5";

/** Formulario para crear o editar un banner, con vista previa en vivo. */
export function BannerForm({ banner, onDone }: { banner?: HomeBanner; onDone?: () => void }) {
  const [state, action, pending] = useActionState<BannerState, FormData>(async (prev, fd) => {
    const res = await saveBanner(prev, fd);
    if (res.ok && onDone) onDone();
    return res;
  }, {});
  const [draft, setDraft] = useState({
    eyebrow: banner?.eyebrow ?? "",
    title: banner?.title ?? "",
    subtitle: banner?.subtitle ?? "",
    cta_label: banner?.cta_label ?? "Ver todo",
    href: banner?.href ?? "/catalogo",
    style: (banner?.style ?? "aurora") as BannerStyle,
    image_url: banner?.image_url ?? "",
    image_layout: (banner?.image_layout ?? "media") as BannerImageLayout,
  });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const set = (k: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const blob = await compress(file, 1600);
      const supabase = createClient();
      const path = `banners/${crypto.randomUUID()}.${photoExt(blob)}`;
      const { error } = await supabase.storage.from("products").upload(path, blob, {
        contentType: blob.type || "image/webp",
        cacheControl: "31536000",
      });
      if (error) throw error;
      setDraft((d) => ({ ...d, image_url: supabase.storage.from("products").getPublicUrl(path).data.publicUrl }));
    } catch {
      setUploadError("No se pudo subir la foto. Intenta con otra.");
    } finally {
      setUploading(false);
    }
  }

  const uid = banner?.id ?? "nuevo";
  return (
    <form action={action} className="grid gap-5 md:grid-cols-2">
      {banner && <input type="hidden" name="id" value={banner.id} />}
      <input type="hidden" name="image_url" value={draft.image_url} />
      <input type="hidden" name="image_layout" value={draft.image_layout} />

      <div className="space-y-3">
        <Field label="Texto chico (opcional)" id={`eyebrow-${uid}`}>
          <input id={`eyebrow-${uid}`} name="eyebrow" maxLength={40} value={draft.eyebrow} onChange={set("eyebrow")} placeholder="Recién llegado" className={input} />
        </Field>
        <Field label="Título" id={`title-${uid}`}>
          <input id={`title-${uid}`} name="title" required maxLength={90} value={draft.title} onChange={set("title")} placeholder="Mudanza en Ñuñoa: 14 muebles nuevos" className={input} />
        </Field>
        <Field label="Bajada (opcional)" id={`subtitle-${uid}`}>
          <input id={`subtitle-${uid}`} name="subtitle" maxLength={160} value={draft.subtitle} onChange={set("subtitle")} className={input} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Texto del botón" id={`cta-${uid}`}>
            <input id={`cta-${uid}`} name="cta_label" maxLength={30} value={draft.cta_label} onChange={set("cta_label")} className={input} />
          </Field>
          <Field label="Estilo" id={`style-${uid}`}>
            <select id={`style-${uid}`} name="style" value={draft.style} onChange={set("style")} className={input}>
              {(Object.keys(STYLE_LABEL) as BannerStyle[]).map((s) => (
                <option key={s} value={s}>{STYLE_LABEL[s]}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Enlace al tocarlo" id={`href-${uid}`} hint="Ej.: /catalogo?categoria=living, /mudanzas o una dirección https://">
          <input id={`href-${uid}`} name="href" required value={draft.href} onChange={set("href")} className={input} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-full border border-foreground px-4 py-2 text-sm font-bold">
            {uploading ? "Subiendo…" : draft.image_url ? "Cambiar foto" : "Agregar foto"}
            <input type="file" accept="image/*" className="sr-only" onChange={onPhoto} disabled={uploading} />
          </label>
          {draft.image_url && (
            <button type="button" onClick={() => setDraft((d) => ({ ...d, image_url: "" }))} className="text-sm font-bold text-pass">
              Quitar foto
            </button>
          )}
          <label className="ml-auto flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" name="active" defaultChecked={banner?.active ?? true} className="h-4 w-4 accent-[var(--brand)]" />
            Visible en la portada
          </label>
        </div>
        {draft.image_url && (
          <div className="space-y-1">
            <p className="text-sm font-bold">Cómo se ve la foto</p>
            <div className="flex gap-2">
              {([["media", "Medio banner"], ["completa", "Banner completo"]] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, image_layout: v }))}
                  aria-pressed={draft.image_layout === v}
                  className={`rounded-full border px-4 py-2 text-sm font-bold ${
                    draft.image_layout === v ? "border-foreground bg-foreground text-background" : "border-border"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {draft.image_layout === "completa" && (
              <p className="text-xs text-muted">La foto cubre todo el banner y el texto va en blanco encima. Con foto completa el estilo de color no se usa.</p>
            )}
          </div>
        )}
        {uploadError && <p className="text-sm font-bold text-pass">{uploadError}</p>}
      </div>

      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Vista previa</p>
        <div className="pointer-events-none">
          <BannerCard banner={{ ...draft, title: draft.title || "Título del banner", image_url: draft.image_url || null }} />
        </div>
        <div className="flex items-center gap-3">
          <button disabled={pending || uploading} className="rounded-full bg-brand px-6 py-3 font-extrabold text-white disabled:opacity-60">
            {pending ? "Guardando…" : banner ? "Guardar cambios" : "Crear banner"}
          </button>
          {state.ok && <p className="text-sm font-bold text-accent">{state.ok}</p>}
          {state.error && <p className="text-sm font-bold text-pass">{state.error}</p>}
        </div>
      </div>
    </form>
  );
}

function Field({ label, id, hint, children }: { label: string; id: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-bold">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
