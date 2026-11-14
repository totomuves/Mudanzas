import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Category, HomeBanner, Product, ShippingRate } from "./types";
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

/** Banners activos de la portada (vacío si aún no se corre la migración de banners). */
export async function getHomeBanners(): Promise<HomeBanner[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("home_banners")
    .select("*")
    .eq("active", true)
    .order("sort_order")
    .order("created_at");
  if (error) return [];
  return (data ?? []) as HomeBanner[];
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
