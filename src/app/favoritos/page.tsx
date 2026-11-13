import type { Metadata } from "next";
import Link from "next/link";
import { hasSupabaseEnv } from "@/lib/env";
import { categoryMap, getCategories } from "@/lib/data";
import { getUser } from "@/lib/supabase/server";
import { ProductCard } from "@/components/ProductCard";
import { SetupNotice } from "@/components/SetupNotice";
import type { Product } from "@/lib/types";

export const metadata: Metadata = { title: "Favoritos" };

export default async function FavoritosPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { supabase, user } = await getUser();
  const categories = await getCategories();
  const cats = categoryMap(categories);

  let products: Product[] = [];
  if (user) {
    const { data } = await supabase
      .from("swipes")
      .select("action, created_at, products(*)")
      .eq("user_id", user.id)
      .in("action", ["like", "superlike"])
      .order("created_at", { ascending: false });
    products = (data ?? [])
      .map((r) => r.products as unknown as Product | null)
      .filter((p): p is Product => Boolean(p) && p!.status !== "hidden");
  }
  const available = products.filter((p) => p.status !== "sold");
  const sold = products.filter((p) => p.status === "sold");

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black">Mis favoritos ❤️</h1>
      {products.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center">
          <p className="text-5xl">💔</p>
          <p className="mt-2 text-muted">Todavía no tienes favoritos. Desliza a la derecha lo que te guste.</p>
          <Link href="/descubrir" className="mt-4 inline-block rounded-full bg-brand px-5 py-2.5 font-extrabold text-white">
            Ir a descubrir
          </Link>
        </div>
      ) : (
        <>
          {available.length > 0 && (
            <p className="rounded-xl bg-yellow-100 p-3 text-sm font-bold text-yellow-900">
              ⏳ Son piezas únicas: si alguien más lo compra primero, se va.
            </p>
          )}
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4 md:gap-x-5">
            {available.map((p) => (
              <ProductCard key={p.id} product={p} category={cats[p.category_slug]} />
            ))}
          </div>
          {sold.length > 0 && (
            <section className="space-y-3 pt-4">
              <h2 className="font-extrabold text-muted">Ya se vendieron</h2>
              <div className="grid grid-cols-2 gap-4 opacity-70 md:grid-cols-4">
                {sold.map((p) => (
                  <ProductCard key={p.id} product={p} category={cats[p.category_slug]} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
