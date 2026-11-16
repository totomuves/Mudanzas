"use client";

import { useActionState, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compress, photoExt } from "@/lib/photo";
import { BannerCard, FLAT_COLORS } from "@/components/BannerCard";
import { Icon, type IconName } from "@/components/Icon";
import type { BannerPage, BannerPlacement, BannerStyle, HomeBanner } from "@/lib/types";
import { saveBanner, type BannerState } from "./actions";

/** Las cuatro formas de banner */
type Kind = "completa" | "media" | "degradado" | "plano";

const KINDS: { key: Kind; label: string; hint: string; icon: IconName }[] = [
  { key: "completa", label: "Foto completa", hint: "La foto cubre todo y el texto va encima", icon: "image" },
  { key: "media", label: "Media foto", hint: "Foto a un lado, degradado o color al otro", icon: "imagePlus" },
  { key: "degradado", label: "Degradado", hint: "Colores del logo, sin foto", icon: "sparkle" },
  { key: "plano", label: "Color plano", hint: "Un solo color, sin foto", icon: "grid" },
];

const GRADIENTS: { key: BannerStyle; label: string; css: string }[] = [
  { key: "aurora", label: "Morado y rosado", css: "linear-gradient(120deg,#5b3fe0,#8f5ce0 45%,#e0609a)" },
  { key: "laguna", label: "Turquesa y morado", css: "linear-gradient(120deg,#0b8f86,#3f6fd8 55%,#5b3fe0)" },
  { key: "pastel", label: "Pastel", css: "linear-gradient(120deg,#e4ddff,#fbd9e8 55%,#c9f2ee)" },
];

/** Estilos antiguos de color: al editarlos pasan a "color plano" con el mismo color */
const LEGACY_COLOR: Partial<Record<BannerStyle, string>> = { suave: "#efebfd", marca: "#5b3fe0", oscuro: "#17151f" };

function initialKind(b?: HomeBanner): Kind {
  if (b?.image_url) return b.image_layout === "completa" ? "completa" : "media";
  if (b && (b.style === "plano" || LEGACY_COLOR[b.style])) return "plano";
  return "degradado";
}

const input = "w-full rounded-xl border border-border bg-background px-3 py-2.5";

/** Formulario para crear o editar un banner, con vista previa en vivo. */
export function BannerForm({ banner, page = "portada", onDone }: { banner?: HomeBanner; page?: BannerPage; onDone?: () => void }) {
  const [state, action, pending] = useActionState<BannerState, FormData>(async (prev, fd) => {
    const res = await saveBanner(prev, fd);
    if (res.ok && onDone) onDone();
    return res;
  }, {});
  const legacy = banner ? LEGACY_COLOR[banner.style] : undefined;
  const [kind, setKind] = useState<Kind>(initialKind(banner));
  const [draft, setDraft] = useState({
    eyebrow: banner?.eyebrow ?? "",
    title: banner?.title ?? "",
    subtitle: banner?.subtitle ?? "",
    cta_label: banner ? banner.cta_label ?? "" : "Ver más",
    href: banner?.href ?? (page === "portada" ? "/catalogo" : "/mudanzas/cotizar"),
    // Fondo que se usa en degradado, color plano y al lado de la media foto
    gradient: (GRADIENTS.some((g) => g.key === banner?.style) ? banner!.style : "aurora") as BannerStyle,
    flat: banner?.style === "plano" || !!legacy,
    bg_color: banner?.bg_color ?? legacy ?? FLAT_COLORS[0].hex,
    image_url: banner?.image_url ?? "",
    placement: (banner?.placement ?? "arriba") as BannerPlacement,
  });
  const [withButton, setWithButton] = useState(banner ? !!banner.cta_label : true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const set = (k: "eyebrow" | "title" | "subtitle" | "cta_label" | "href") => (e: React.ChangeEvent<HTMLInputElement>) =>
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
      setUploadError("No se pudo subir la foto. Si es la primera vez, revisa que esté corrida la migración 20261116140000_banners_paginas.sql.");
    } finally {
      setUploading(false);
    }
  }

  // Lo que se guarda según la forma elegida
  const hasPhoto = kind === "completa" || kind === "media";
  const useFlat = kind === "plano" || (kind === "media" && draft.flat);
  const style: BannerStyle = useFlat ? "plano" : draft.gradient;
  const saved = {
    eyebrow: draft.eyebrow,
    title: draft.title,
    subtitle: draft.subtitle,
    cta_label: withButton ? draft.cta_label : "",
    href: withButton ? draft.href : "",
    style,
    bg_color: useFlat ? draft.bg_color : null,
    image_url: hasPhoto ? draft.image_url : "",
    image_layout: kind === "completa" ? ("completa" as const) : ("media" as const),
  };
  const missingPhoto = hasPhoto && !draft.image_url;

  const uid = banner?.id ?? `nuevo-${page}`;
  return (
    <form action={action} className="grid gap-5 md:grid-cols-2">
      {banner && <input type="hidden" name="id" value={banner.id} />}
      <input type="hidden" name="page" value={page} />
      <input type="hidden" name="image_url" value={saved.image_url} />
      <input type="hidden" name="image_layout" value={saved.image_layout} />
      <input type="hidden" name="style" value={saved.style} />
      <input type="hidden" name="bg_color" value={saved.bg_color ?? ""} />
      <input type="hidden" name="placement" value={draft.placement} />
      <input type="hidden" name="cta_label" value={saved.cta_label} />
      <input type="hidden" name="href" value={saved.href} />

      <div className="space-y-4">
        {/* Forma del banner */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold">Tipo de banner</legend>
          <div className="grid grid-cols-2 gap-2">
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                aria-pressed={kind === k.key}
                className={`flex items-start gap-2 rounded-xl border p-3 text-left ${
                  kind === k.key ? "border-foreground ring-1 ring-foreground" : "border-border hover:bg-surface"
                }`}
              >
                <Icon name={k.icon} className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.8} />
                <span>
                  <span className="block text-sm font-extrabold">{k.label}</span>
                  <span className="block text-xs text-muted">{k.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        {/* Foto */}
        {hasPhoto && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-full border border-foreground px-4 py-2 text-sm font-bold">
              <Icon name="camera" className="h-4 w-4" strokeWidth={2} />
              {uploading ? "Subiendo…" : draft.image_url ? "Cambiar foto" : "Subir foto"}
              <input type="file" accept="image/*" className="sr-only" onChange={onPhoto} disabled={uploading} />
            </label>
            {missingPhoto && !uploading && <p className="text-xs text-muted">Este tipo necesita una foto.</p>}
          </div>
        )}
        {uploadError && <p className="text-sm font-bold text-pass">{uploadError}</p>}

        {/* Fondo: en media foto se elige entre degradado y color */}
        {kind === "media" && (
          <div className="flex gap-2">
            {([[false, "Al lado: degradado"], [true, "Al lado: color plano"]] as const).map(([flat, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, flat }))}
                aria-pressed={draft.flat === flat}
                className={`rounded-full border px-4 py-2 text-sm font-bold ${
                  draft.flat === flat ? "border-foreground bg-foreground text-background" : "border-border"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {(kind === "degradado" || (kind === "media" && !draft.flat)) && (
          <div className="space-y-1">
            <p className="text-sm font-bold">Degradado</p>
            <div className="flex flex-wrap gap-2">
              {GRADIENTS.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, gradient: g.key }))}
                  aria-pressed={draft.gradient === g.key}
                  className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm font-bold ${
                    draft.gradient === g.key ? "border-foreground ring-1 ring-foreground" : "border-border"
                  }`}
                >
                  <span className="h-7 w-7 rounded-full" style={{ background: g.css }} aria-hidden />
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {useFlat && (
          <div className="space-y-1">
            <p className="text-sm font-bold">Color</p>
            <div className="flex flex-wrap items-center gap-2">
              {FLAT_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  title={c.label}
                  aria-label={c.label}
                  aria-pressed={draft.bg_color.toLowerCase() === c.hex}
                  onClick={() => setDraft((d) => ({ ...d, bg_color: c.hex }))}
                  className={`h-9 w-9 rounded-full border border-border ${
                    draft.bg_color.toLowerCase() === c.hex ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
              <label className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3 text-sm font-bold">
                <input
                  type="color"
                  value={draft.bg_color}
                  onChange={(e) => setDraft((d) => ({ ...d, bg_color: e.target.value }))}
                  className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
                />
                Otro color
              </label>
            </div>
          </div>
        )}

        {/* Textos */}
        <Field label="Texto chico (opcional)" id={`eyebrow-${uid}`}>
          <input id={`eyebrow-${uid}`} name="eyebrow" maxLength={40} value={draft.eyebrow} onChange={set("eyebrow")} placeholder="Recién llegado" className={input} />
        </Field>
        <Field label="Título" id={`title-${uid}`}>
          <input id={`title-${uid}`} name="title" required maxLength={90} value={draft.title} onChange={set("title")} placeholder={page === "portada" ? "14 muebles nuevos esta semana" : "Así cuidamos tus cosas"} className={input} />
        </Field>
        <Field label="Bajada (opcional)" id={`subtitle-${uid}`}>
          <input id={`subtitle-${uid}`} name="subtitle" maxLength={160} value={draft.subtitle} onChange={set("subtitle")} className={input} />
        </Field>

        {/* Botón */}
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={withButton} onChange={(e) => setWithButton(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          Con botón
        </label>
        {withButton && (
          <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
            <Field label="Texto del botón" id={`cta-${uid}`}>
              <input id={`cta-${uid}`} maxLength={30} value={draft.cta_label} onChange={set("cta_label")} required className={input} />
            </Field>
            <Field label="Enlace al tocarlo" id={`href-${uid}`} hint="Ej.: /mudanzas/cotizar, /catalogo o https://…">
              <input id={`href-${uid}`} value={draft.href} onChange={set("href")} required className={input} />
            </Field>
          </div>
        )}

        {/* Lugar en la página */}
        {page !== "portada" && (
          <fieldset className="space-y-1">
            <legend className="text-sm font-bold">Dónde va en la página</legend>
            <div className="flex flex-wrap gap-2">
              {([["arriba", "Arriba, bajo la portada"], ["abajo", "Abajo, antes del final"]] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, placement: v }))}
                  aria-pressed={draft.placement === v}
                  className={`rounded-full border px-4 py-2 text-sm font-bold ${
                    draft.placement === v ? "border-foreground bg-foreground text-background" : "border-border"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" name="active" defaultChecked={banner?.active ?? true} className="h-4 w-4 accent-[var(--brand)]" />
          Visible en la página
        </label>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Vista previa</p>
        <div className="pointer-events-none">
          <BannerCard banner={{ ...saved, title: draft.title || "Título del banner", image_url: saved.image_url || null }} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={pending || uploading || missingPhoto} className="rounded-full bg-brand px-6 py-3 font-extrabold text-white disabled:opacity-60">
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
