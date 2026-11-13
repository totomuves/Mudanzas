import Link from "next/link";
import { APP_NAME, hasSupabaseEnv } from "@/lib/env";
import { categoryMap, getCategories } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { ProductCard } from "@/components/ProductCard";
import { SetupNotice } from "@/components/SetupNotice";
import type { Product } from "@/lib/types";

export default async function Home() {
  if (!hasSupabaseEnv()) return <SetupNotice />;

  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const [categories, latest, flash] = await Promise.all([
    getCategories(),
    supabase
      .from("products")
      .select("*")
      .eq("status", "available")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("products")
      .select("*")
      .eq("status", "available")
      .not("flash_price", "is", null)
      .gt("flash_until", nowIso)
      .order("flash_until")
      .limit(4),
  ]);
  const cats = categoryMap(categories);
  const latestProducts = (latest.data ?? []) as Product[];
  const flashProducts = (flash.data ?? []) as Product[];

  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-rose-500 px-6 py-10 text-white md:px-12 md:py-16">
        <div className="max-w-xl space-y-4">
          <p className="text-sm font-bold uppercase tracking-widest text-white/80">{APP_NAME}</p>
          <h1 className="text-4xl font-black leading-tight md:text-5xl">
            Lo que otros dejan en su mudanza, tú lo estrenas.
          </h1>
          <p className="text-lg text-white/90">
            Muebles, electro y tesoros a precios bajísimos. Desliza ❤️ lo que te gusta y la app
            aprende qué mostrarte.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/bienvenida"
              className="rounded-full bg-white px-6 py-3 font-extrabold text-brand shadow-lg hover:scale-105"
            >
              Empezar a descubrir
            </Link>
            <Link
              href="/catalogo"
              className="rounded-full border-2 border-white/70 px-6 py-3 font-extrabold hover:bg-white/10"
            >
              Ver catálogo
            </Link>
          </div>
        </div>
        <div className="pointer-events-none absolute -right-6 -top-4 hidden rotate-12 text-[180px] opacity-90 md:block" aria-hidden>
          🛋️
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { icon: "✨", title: "Cuéntanos qué buscas", text: "Elige categorías, tu comuna y presupuesto." },
          { icon: "👆", title: "Desliza", text: "❤️ si te gusta, ✖️ si no. Cada swipe afina tus recomendaciones." },
          { icon: "🛒", title: "Compra seguro", text: "Paga con Mercado Pago y coordina retiro o despacho." },
        ].map((s) => (
          <div key={s.title} className="rounded-2xl border border-border bg-card p-5">
            <div className="text-3xl">{s.icon}</div>
            <h2 className="mt-2 font-extrabold">{s.title}</h2>
            <p className="text-sm text-muted">{s.text}</p>
          </div>
        ))}
      </section>

      {flashProducts.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-2xl font-black">⚡ Ofertas relámpago</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {flashProducts.map((p) => (
              <ProductCard key={p.id} product={p} category={cats[p.category_slug]} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-black">Recién llegados</h2>
          <Link href="/catalogo" className="text-sm font-bold text-brand">
            Ver todo →
          </Link>
        </div>
        {latestProducts.length === 0 ? (
          <p className="text-muted">Pronto subiremos los primeros tesoros. 📦</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {latestProducts.map((p) => (
              <ProductCard key={p.id} product={p} category={cats[p.category_slug]} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <Link
            key={c.slug}
            href={`/catalogo?categoria=${c.slug}`}
            className="rounded-full border border-border bg-card px-4 py-2 text-sm font-bold hover:border-brand"
          >
            {c.emoji} {c.name}
          </Link>
        ))}
      </section>
    </div>
  );
}
