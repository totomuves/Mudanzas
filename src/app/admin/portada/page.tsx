import type { Metadata } from "next";
import { hasSupabaseEnv } from "@/lib/env";
import { requireSection } from "@/lib/admin";
import { SetupNotice } from "@/components/SetupNotice";
import type { HomeBanner } from "@/lib/types";
import { BannerForm } from "./BannerForm";
import { BannerItem } from "./BannerItem";
import { Phrases } from "./Phrases";
import { getCategories } from "@/lib/data";
import type { SitePhrase } from "@/lib/phrases";

export const metadata: Metadata = { title: "Portada" };

export default async function PortadaAdminPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { supabase } = await requireSection("portada");
  const { data, error } = await supabase.from("home_banners").select("*").order("sort_order").order("created_at");
  const banners = (data ?? []) as HomeBanner[];
  const [categories, phrasesRes] = await Promise.all([
    getCategories(),
    supabase.from("site_phrases").select("*").order("sort_order").order("created_at"),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-black">Banners de la portada</h1>
        <p className="text-muted">
          Son los recuadros grandes del inicio. Si hay más de uno, se deslizan de lado. Úsalos para anunciar productos nuevos,
          una categoría o un servicio.
        </p>
      </div>

      {error && (
        <p className="rounded-2xl bg-brand-soft p-4 text-sm font-bold">
          Falta crear la tabla de banners. En Supabase, abre SQL Editor y corre el archivo
          supabase/migrations/20261113140000_banners_portada.sql.
        </p>
      )}

      {banners.length > 0 ? (
        <ul className="space-y-4">
          {banners.map((b, i) => (
            <BannerItem key={b.id} banner={b} first={i === 0} last={i === banners.length - 1} />
          ))}
        </ul>
      ) : (
        !error && (
          <p className="rounded-2xl border-2 border-dashed border-border p-6 text-center text-muted">
            Aún no hay banners. Mientras tanto la portada muestra el texto de src/brand.ts.
          </p>
        )
      )}

      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-6">
        <h2 className="text-lg font-black">Nuevo banner</h2>
        <BannerForm key={banners.length} />
      </section>

      <Phrases
        phrases={(phrasesRes.data ?? []) as SitePhrase[]}
        categories={categories}
        missing={Boolean(phrasesRes.error)}
      />
    </div>
  );
}
