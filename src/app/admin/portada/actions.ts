"use server";

import { revalidatePath } from "next/cache";
import { getAdminAccess, requireSection } from "@/lib/admin";
import type { BannerImageLayout, BannerPage, BannerPlacement, BannerStyle } from "@/lib/types";

const FALTA_MIGRACION =
  "Falta correr en Supabase la migración 20261116140000_banners_paginas.sql (banners en páginas, color plano y botón opcional).";
/** Errores que aparecen si todavía no se corren las migraciones de banners */
const sinMigracion = (code?: string) => code === "23514" || code === "23502" || code === "42703" || code === "PGRST204";

export type BannerState = { ok?: string; error?: string };

const STYLES: BannerStyle[] = ["aurora", "laguna", "pastel", "plano", "suave", "marca", "oscuro"];
const PAGES: BannerPage[] = ["portada", "mudanzas", "conocenos"];
const STORAGE_PREFIX = "/storage/v1/object/public/products/";

function text(formData: FormData, name: string, max: number) {
  return String(formData.get(name) ?? "").trim().slice(0, max);
}

function pageOf(formData: FormData): BannerPage {
  const p = text(formData, "page", 20) as BannerPage;
  return PAGES.includes(p) ? p : "portada";
}

/**
 * Permiso para editar banners: la sección Portada edita todos;
 * Agenda mudanzas puede editar los de Mudanzas y Conócenos.
 */
async function requireBanners(page: BannerPage) {
  const access = await getAdminAccess();
  if (access.user && !access.user.is_anonymous) {
    if (access.sections.includes("portada")) return access;
    if (page !== "portada" && access.sections.includes("mudanzas")) return access;
  }
  return requireSection(page === "portada" ? "portada" : "mudanzas");
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
  revalidatePath("/mudanzas");
  revalidatePath("/mudanzas/conocenos");
  revalidatePath("/admin/portada");
  revalidatePath("/admin/paginas");
}

export async function saveBanner(_prev: BannerState, formData: FormData): Promise<BannerState> {
  const page = pageOf(formData);
  const { supabase } = await requireBanners(page);
  const id = text(formData, "id", 40);
  const title = text(formData, "title", 90);
  const ctaLabel = text(formData, "cta_label", 30) || null;
  const href = ctaLabel ? text(formData, "href", 300) || null : null;
  const style = text(formData, "style", 10) as BannerStyle;
  const imageUrl = text(formData, "image_url", 500) || null;
  const bgColor = text(formData, "bg_color", 7);
  const placement: BannerPlacement = text(formData, "placement", 10) === "abajo" ? "abajo" : "arriba";

  if (title.length < 2) return { error: "Escribe un título." };
  if (ctaLabel && !href) return { error: "Escribe a dónde lleva el botón, o deja el botón apagado." };
  if (href && !/^(\/|https:\/\/)/.test(href)) {
    return { error: "El enlace debe empezar con / (página de la app) o con https://" };
  }
  if (!STYLES.includes(style)) return { error: "Elige un estilo." };
  if (style === "plano" && !/^#[0-9a-fA-F]{6}$/.test(bgColor)) return { error: "Elige un color." };

  const row = {
    eyebrow: text(formData, "eyebrow", 40) || null,
    title,
    subtitle: text(formData, "subtitle", 160) || null,
    cta_label: ctaLabel,
    href,
    style,
    bg_color: style === "plano" ? bgColor.toLowerCase() : null,
    image_url: imageUrl,
    image_layout: (text(formData, "image_layout", 10) === "completa" ? "completa" : "media") as BannerImageLayout,
    placement,
    active: formData.get("active") === "on",
  };

  if (id) {
    const { data: before } = await supabase.from("home_banners").select("image_url").eq("id", id).maybeSingle();
    const { error } = await supabase.from("home_banners").update(row).eq("id", id);
    if (error) return { error: sinMigracion(error.code) ? FALTA_MIGRACION : "No se pudo guardar. Intenta de nuevo." };
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
    const { error } = await supabase
      .from("home_banners")
      .insert({ ...row, page, sort_order: (last?.sort_order ?? -1) + 1 });
    if (error) {
      return {
        error: error.code === "42P01"
          ? "Falta crear la tabla de banners: corre la migración 20261113140000_banners_portada.sql en Supabase."
          : sinMigracion(error.code)
            ? FALTA_MIGRACION
            : "No se pudo crear el banner. Intenta de nuevo.",
      };
    }
  }
  refresh();
  return { ok: id ? "Cambios guardados." : "Banner creado." };
}

export async function deleteBanner(formData: FormData) {
  const { supabase } = await requireBanners(pageOf(formData));
  const id = String(formData.get("id"));
  const { data } = await supabase.from("home_banners").select("image_url").eq("id", id).maybeSingle();
  await supabase.from("home_banners").delete().eq("id", id);
  const path = bannerPath(data?.image_url ?? null);
  if (path) await supabase.storage.from("products").remove([path]);
  refresh();
}

/** Sube o baja un banner en el orden de su página. */
export async function moveBanner(formData: FormData) {
  const page = pageOf(formData);
  const { supabase } = await requireBanners(page);
  const id = String(formData.get("id"));
  const dir = formData.get("dir") === "up" ? -1 : 1;
  let res = await supabase.from("home_banners").select("id, sort_order").eq("page", page).order("sort_order").order("created_at");
  // Sin la migración de páginas, todos los banners son de la portada
  if (res.error) res = await supabase.from("home_banners").select("id, sort_order").order("sort_order").order("created_at");
  const list = res.data ?? [];
  const i = list.findIndex((b) => b.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await Promise.all(
    list.map((b, idx) => (b.sort_order === idx ? null : supabase.from("home_banners").update({ sort_order: idx }).eq("id", b.id))),
  );
  refresh();
}
