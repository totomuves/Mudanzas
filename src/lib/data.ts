import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { BannerPage, Category, HomeBanner, Product, ShippingRate } from "./types";
import type { MovingSettings, ServiceType } from "./moving";

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("*").order("sort_order");
  return (data ?? []) as Category[];
}

export function categoryMap(categories: Category[]) {
  return Object.fromEntries(categories.map((c) => [c.slug, c])) as Record<string, Category>;
}

export async function getProduct(id: string): Promise<Product | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("*, available_units")
    .eq("id", id)
    .maybeSingle();
  return (data as Product | null) ?? null;
}

/** Banners activos de una página (vacío si aún no se corre la migración de banners). */
export async function getPageBanners(page: BannerPage): Promise<HomeBanner[]> {
  const supabase = await createClient();
  const query = () =>
    supabase.from("home_banners").select("*").eq("active", true).order("sort_order").order("created_at");
  const { data, error } = await query().eq("page", page);
  if (error) {
    // Sin la migración 20261116140000 no existe la columna "page": todos los banners son de la portada
    if (page === "portada" && (error.code === "42703" || error.code === "PGRST204")) {
      const old = await query();
      return (old.data ?? []) as HomeBanner[];
    }
    return [];
  }
  return (data ?? []) as HomeBanner[];
}

/** Banners activos de la portada. */
export function getHomeBanners(): Promise<HomeBanner[]> {
  return getPageBanners("portada");
}

/** Comunas con despacho activo y su precio (vacío si aún no se corre la migración). */
export async function getShippingRates(): Promise<Pick<ShippingRate, "comuna" | "price">[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shipping_rates")
    .select("comuna, price")
    .eq("active", true)
    .order("comuna");
  if (error) return [];
  return ((data ?? []) as Pick<ShippingRate, "comuna" | "price">[]).sort((a, b) => a.comuna.localeCompare(b.comuna, "es"));
}

export async function getMovingData() {
  const supabase = await createClient();
  const [{ data: services }, { data: settings }] = await Promise.all([
    supabase.from("service_types").select("*").eq("active", true).order("sort_order"),
    supabase.from("moving_settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  return {
    services: (services ?? []) as ServiceType[],
    settings: settings as MovingSettings | null,
  };
}

/** Fotos visibles de la galería de una página (vacío si aún no se corre la migración). */
export async function getPagePhotos(page: "mudanzas" | "conocenos") {
  const supabase = await createClient();
  const query = () =>
    supabase.from("moving_works").select("id, image_url, title, caption").eq("active", true).order("sort_order").order("created_at");
  let res = await query().eq("page", page);
  // Sin la migración de páginas no existe la columna: todas las fotos son de Conócenos
  if (res.error && page === "conocenos") res = await query();
  if (res.error) return [];
  return (res.data ?? []) as { id: string; image_url: string; title: string | null; caption: string | null }[];
}
