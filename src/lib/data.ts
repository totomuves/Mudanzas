import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Category, Product } from "./types";

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
  const { data } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  return (data as Product | null) ?? null;
}
