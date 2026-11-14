"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import type { BannerImageLayout, BannerStyle } from "@/lib/types";

const FALTA_DEGRADADOS =
  "Para usar los degradados y la foto completa falta correr la migración 20261114120000_banners_degradados.sql en Supabase.";
/** Errores que aparecen si todavía no se corre la migración de degradados */
const sinMigracion = (code?: string) => code === "23514" || code === "42703" || code === "PGRST204";

export type BannerState = { ok?: string; error?: string };

const STYLES: BannerStyle[] = ["aurora", "laguna", "pastel", "suave", "marca", "oscuro"];
const STORAGE_PREFIX = "/storage/v1/object/public/products/";

function text(formData: FormData, name: string, max: number) {
  return String(formData.get(name) ?? "").trim().slice(0, max);
}

/** Ruta dentro del bucket a partir de la URL pública (solo fotos de banners). */
function bannerPath(url: string | null) {
  if (!url) return null;
  const i = url.indexOf(STORAGE_PREFIX);
  if (i < 0) return null;
  const path = decodeURIComponent(url.slice(i + STORAGE_PREFIX.length).split("?")[0]);
  return path.startsWith("banners/") ? path : null;
}

function refresh() {
  revalidatePath("/");
  revalidatePath("/admin/portada");
}

export async function saveBanner(_prev: BannerState, formData: FormData): Promise<BannerState> {
  const { supabase } = await requireAdmin();
  const id = text(formData, "id", 40);
  const title = text(formData, "title", 90);
  const href = text(formData, "href", 300) || "/catalogo";
  const style = text(formData, "style", 10) as BannerStyle;
  const imageUrl = text(formData, "image_url", 500) || null;

  if (title.length < 2) return { error: "Escribe un título." };
  if (!/^(\/|https:\/\/)/.test(href)) {
    return { error: "El enlace debe empezar con / (página de la app) o con https://" };
  }
  if (!STYLES.includes(style)) return { error: "Elige un estilo." };

  const row = {
    eyebrow: text(formData, "eyebrow", 40) || null,
    title,
    subtitle: text(formData, "subtitle", 160) || null,
    cta_label: text(formData, "cta_label", 30) || "Ver todo",
    href,
    style,
    image_url: imageUrl,
    image_layout: (text(formData, "image_layout", 10) === "completa" ? "completa" : "media") as BannerImageLayout,
    active: formData.get("active") === "on",
  };

  if (id) {
    const { data: before } = await supabase.from("home_banners").select("image_url").eq("id", id).maybeSingle();
    const { error } = await supabase.from("home_banners").update(row).eq("id", id);
    if (error) return { error: sinMigracion(error.code) ? FALTA_DEGRADADOS : "No se pudo guardar. Intenta de nuevo." };
    // Si se cambió o quitó la foto, borra la anterior del almacenamiento
    const old = bannerPath(before?.image_url ?? null);
    if (old && before?.image_url !== imageUrl) await supabase.storage.from("products").remove([old]);
  } else {
    const { data: last } = await supabase
      .from("home_banners")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase.from("home_banners").insert({ ...row, sort_order: (last?.sort_order ?? -1) + 1 });
    if (error) {
      return {
        error: error.code === "42P01"
          ? "Falta crear la tabla de banners: corre la migración 20261113140000_banners_portada.sql en Supabase."
          : sinMigracion(error.code)
            ? FALTA_DEGRADADOS
            : "No se pudo crear el banner. Intenta de nuevo.",
      };
    }
  }
  refresh();
  return { ok: id ? "Cambios guardados." : "Banner creado." };
}

export async function deleteBanner(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id"));
  const { data } = await supabase.from("home_banners").select("image_url").eq("id", id).maybeSingle();
  await supabase.from("home_banners").delete().eq("id", id);
  const path = bannerPath(data?.image_url ?? null);
  if (path) await supabase.storage.from("products").remove([path]);
  refresh();
}

/** Sube o baja un banner en el orden de la portada. */
export async function moveBanner(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id"));
  const dir = formData.get("dir") === "up" ? -1 : 1;
  const { data } = await supabase.from("home_banners").select("id, sort_order").order("sort_order").order("created_at");
  const list = data ?? [];
  const i = list.findIndex((b) => b.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await Promise.all(
    list.map((b, idx) => (b.sort_order === idx ? null : supabase.from("home_banners").update({ sort_order: idx }).eq("id", b.id))),
  );
  refresh();
}
