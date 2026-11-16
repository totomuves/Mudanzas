import "server-only";
import { createClient } from "@supabase/supabase-js";
import { hasSupabaseEnv, siteUrl, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";
import { currentPrice, isFlashActive } from "@/lib/format";
import { brand } from "@/brand";
import type { Category, Condition, Product } from "@/lib/types";

/**
 * Catálogo público (lo que ve un visitante sin cuenta). Lo usan el sitemap y
 * los feeds de Google Shopping, Meta (Instagram/Facebook) y TikTok. Usa la clave
 * pública, así respeta las mismas reglas de visibilidad que la tienda
 * (con el marketplace apagado solo aparecen los productos de MUVEO).
 */
function publicClient() {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type CatalogProduct = Pick<
  Product,
  | "id"
  | "title"
  | "description"
  | "category_slug"
  | "price"
  | "original_price"
  | "condition"
  | "images"
  | "quantity"
  | "status"
  | "flash_price"
  | "flash_until"
  | "updated_at"
>;

export async function getPublicCatalog(): Promise<{ products: CatalogProduct[]; categories: Category[] }> {
  if (!hasSupabaseEnv()) return { products: [], categories: [] };
  const supabase = publicClient();
  const products: CatalogProduct[] = [];
  // De a 1000 (límite de Supabase por consulta), hasta 10.000 productos
  for (let from = 0; from < 10000; from += 1000) {
    const { data, error } = await supabase
      .from("products")
      .select("id, title, description, category_slug, price, original_price, condition, images, quantity, status, flash_price, flash_until, updated_at")
      .eq("status", "available")
      .gt("quantity", 0)
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (error || !data?.length) break;
    products.push(...(data as CatalogProduct[]));
    if (data.length < 1000) break;
  }
  const { data: cats } = await supabase.from("categories").select("*").order("sort_order");
  return { products, categories: (cats ?? []) as Category[] };
}

/**
 * Categoría de Google para cada categoría de la tienda
 * (https://support.google.com/merchants/answer/6324436). Meta y TikTok usan la misma lista.
 */
export const GOOGLE_CATEGORY: Record<string, number> = {
  muebles: 436, // Muebles
  cocina: 638, // Casa y jardín > Cocina y comedor
  electro: 604, // Casa y jardín > Electrodomésticos
  tecnologia: 222, // Electrónica
  dormitorio: 569, // Casa y jardín > Ropa de cama y baño > Ropa de cama
  deco: 696, // Casa y jardín > Decoración
  ninos: 537, // Bebés y niños pequeños
  deporte: 988, // Artículos deportivos
  libros: 783, // Multimedia
  herramientas: 632, // Ferretería
  ropa: 166, // Ropa y accesorios
  mascotas: 1, // Animales y artículos para mascotas
};

/** Nuevo = new; el resto es usado (Google, Meta y TikTok solo aceptan new/refurbished/used). */
export function feedCondition(c: Condition) {
  return c === "nuevo" ? "new" : "used";
}

export function productUrl(id: string) {
  return `${siteUrl()}/producto/${id}`;
}

/** Datos listos para un feed de catálogo, comunes a Google, Meta y TikTok. */
export function feedItem(p: CatalogProduct, categories: Category[]) {
  const flash = isFlashActive(p);
  const description = (p.description || p.title).replace(/\s+/g, " ").trim().slice(0, 4900);
  return {
    id: p.id,
    title: p.title.slice(0, 150),
    description,
    link: productUrl(p.id),
    image: p.images[0],
    extraImages: p.images.slice(1, 10),
    condition: feedCondition(p.condition),
    // Precio normal; si hay oferta relámpago va aparte como precio rebajado
    price: `${p.price} CLP`,
    salePrice: flash ? `${currentPrice(p)} CLP` : null,
    saleUntil: flash && p.flash_until ? `${new Date().toISOString()}/${new Date(p.flash_until).toISOString()}` : null,
    quantity: p.quantity,
    brand: brand.name,
    googleCategory: GOOGLE_CATEGORY[p.category_slug] ?? null,
    productType: categories.find((c) => c.slug === p.category_slug)?.name ?? null,
  };
}

/** Productos que se pueden publicar en un catálogo (Google exige foto). */
export function feedable(p: CatalogProduct) {
  return p.images.length > 0 && /^https:\/\//.test(p.images[0]) && p.price > 0;
}
