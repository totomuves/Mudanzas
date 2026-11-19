import { createClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/types";

export type PickForYou = { product: Product; reason: string | null };

/**
 * El producto que acompaña a la frase del título: el que el recomendador
 * ("conocer al comprador", función recommend) elige para esta persona según
 * sus gustos. Sin sesión o sin historial, recommend igual devuelve lo más
 * atractivo; si la función no existe todavía, se usa el más nuevo.
 */
export async function getPickForYou(category?: string): Promise<PickForYou | null> {
  try {
    const supabase = await createClient();
    const rec = await supabase.rpc("recommend", {
      p_limit: 1,
      p_categories: category ? [category] : null,
      p_exclude: null,
    });
    const first = !rec.error ? (rec.data as { product: Product; reason: string | null }[] | null)?.[0] : undefined;
    if (first?.product?.id) return { product: first.product, reason: first.reason };

    let q = supabase.from("products").select("*").eq("status", "available").order("created_at", { ascending: false }).limit(1);
    if (category) q = q.eq("category_slug", category);
    const { data } = await q;
    const p = (data?.[0] ?? null) as Product | null;
    return p ? { product: p, reason: null } : null;
  } catch {
    return null;
  }
}
