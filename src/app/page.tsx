import Link from "next/link";
import { hasSupabaseEnv } from "@/lib/env";
import { brand } from "@/brand";
import { categoryMap, getCategories, getHomeBanners } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { ProductCard } from "@/components/ProductCard";
import { getMarketplaceEnabled } from "@/lib/seller";
import { BannerCard } from "@/components/BannerCard";
import { CategoryIcon, Icon } from "@/components/Icon";
import { SetupNotice } from "@/components/SetupNotice";
import type { Product } from "@/lib/types";

export default async function Home() {
  if (!hasSupabaseEnv()) return <SetupNotice />;

  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const [categories, banners, latest, flash, marketplaceOn] = await Promise.all([
    getCategories(),
    getHomeBanners(),
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
    getMarketplaceEnabled(),
  ]);
  const cats = categoryMap(categories);
  const latestProducts = (latest.data ?? []) as Product[];
  const flashProducts = (flash.data ?? []) as Product[];

  // Si todavía no hay banners en el admin, se muestra el texto de src/brand.ts
  const slides = banners.length
    ? banners
    : [
        {
          id: "brand",
          eyebrow: brand.name,
          title: brand.hero.title,
          subtitle: brand.hero.subtitle,
          cta_label: brand.hero.cta,
          href: "/bienvenida",
          image_url: null,
          style: "aurora" as const,
        },
      ];

  return (
    <div className="space-y-10 md:space-y-14">
      <form action="/catalogo" className="md:hidden">
        <label className="flex items-center gap-2 rounded-full bg-surface px-4 py-3 text-muted focus-within:ring-2 focus-within:ring-foreground">
          <Icon name="search" className="h-5 w-5" strokeWidth={2} />
          <input name="q" placeholder="Buscar sofás, camas, lavadoras…" className="w-full bg-transparent text-foreground outline-none placeholder:text-muted" />
        </label>
      </form>

      <section className="space-y-4">
        <h1 className="text-[28px] font-black leading-tight md:text-4xl">{brand.hero.title}</h1>
        <div className="scroll-row -mx-4 flex gap-4 overflow-x-auto px-4 pb-1">
          {categories.map((c) => (
            <Link key={c.slug} href={`/catalogo?categoria=${c.slug}`} className="group flex w-[72px] shrink-0 flex-col items-center gap-1.5 text-center md:w-20">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface transition group-hover:ring-2 group-hover:ring-foreground md:h-20 md:w-20" aria-hidden>
                <CategoryIcon slug={c.slug} className="h-7 w-7 md:h-8 md:w-8" strokeWidth={1.5} />
              </span>
              <span className="line-clamp-2 w-full hyphens-auto break-words text-[11px] font-semibold leading-tight md:text-xs">{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <section
        className={`scroll-row -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 md:mx-0 md:scroll-px-0 md:px-0 ${slides.length === 1 ? "" : "pr-10"}`}
        aria-label="Destacados"
      >
        {slides.map((b, i) => (
          <div key={b.id} className={`shrink-0 snap-start ${slides.length === 1 ? "w-full" : "w-[88%] md:w-[70%]"}`}>
            <BannerCard banner={b} priority={i === 0} />
          </div>
        ))}
      </section>

      {flashProducts.length > 0 && (
        <section className="space-y-4">
          <SectionTitle title="Ofertas relámpago" href="/catalogo" />
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4 md:gap-x-5">
            {flashProducts.map((p) => (
              <ProductCard key={p.id} product={p} category={cats[p.category_slug]} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <SectionTitle title="Recién llegados" href="/catalogo" />
        {latestProducts.length === 0 ? (
          <p className="text-muted">Pronto subiremos los primeros tesoros.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4 md:gap-x-5">
            {latestProducts.map((p) => (
              <ProductCard key={p.id} product={p} category={cats[p.category_slug]} />
            ))}
          </div>
        )}
      </section>

      <Link
        href="/mudanzas"
        className="group flex items-center gap-4 rounded-card bg-surface p-5 md:p-8"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-background">
          <Icon name="truck" className="h-7 w-7" />
        </span>
        <span className="flex-1">
          <span className="block text-lg font-black">¿Te cambias de casa?</span>
          <span className="block text-sm text-muted">Cotiza tu mudanza en un minuto y reserva tu hora en línea.</span>
        </span>
        <Icon name="arrow" className="h-6 w-6 transition group-hover:translate-x-1" />
      </Link>

      {marketplaceOn && (
      <Link href="/vender" className="group flex items-center gap-4 rounded-card border border-border p-5 md:p-8">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface">
          <Icon name="store" className="h-7 w-7" />
        </span>
        <span className="flex-1">
          <span className="block text-lg font-black">Vende con nosotros</span>
          <span className="block text-sm text-muted">¿Te sobran cosas o tienes una empresa de mudanzas? Súbelas y nosotros las vendemos.</span>
        </span>
        <Icon name="arrow" className="h-6 w-6 transition group-hover:translate-x-1" />
      </Link>
      )}

      <section className="grid gap-6 border-t border-border pt-8 md:grid-cols-3">
        {[
          { icon: "sparkle" as const, title: "Cuéntanos qué buscas", text: "Elige categorías, tu comuna y presupuesto." },
          { icon: "cards" as const, title: "Desliza", text: "Corazón si te gusta, equis si no. Cada swipe afina lo que te mostramos." },
          { icon: "check" as const, title: "Compra seguro", text: "Paga con Mercado Pago y coordina retiro o despacho." },
        ].map((s) => (
          <div key={s.title} className="flex gap-3">
            <Icon name={s.icon} className="h-6 w-6 shrink-0" />
            <div>
              <h2 className="font-extrabold">{s.title}</h2>
              <p className="text-sm text-muted">{s.text}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function SectionTitle({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="text-xl font-black md:text-2xl">{title}</h2>
      <Link href={href} className="text-sm font-semibold underline underline-offset-4 hover:text-brand">
        Ver todo
      </Link>
    </div>
  );
}
