import { BannerCard } from "@/components/BannerCard";
import type { HomeBanner } from "@/lib/types";

/**
 * Banners de una página (Mudanzas o Conócenos) en un lugar: "arriba" o "abajo".
 * Se editan en /admin/paginas. Si hay más de uno, se deslizan de lado como en la portada.
 */
export function PageBanners({ banners, placement }: { banners: HomeBanner[]; placement: "arriba" | "abajo" }) {
  const list = banners.filter((b) => (b.placement ?? "arriba") === placement);
  if (list.length === 0) return null;
  return (
    <section
      className={`scroll-row -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 md:mx-0 md:scroll-px-0 md:px-0 ${list.length === 1 ? "" : "pr-10"}`}
      aria-label="Destacados"
    >
      {list.map((b) => (
        <div key={b.id} className={`shrink-0 snap-start ${list.length === 1 ? "w-full" : "w-[88%] md:w-[70%]"}`}>
          <BannerCard banner={b} />
        </div>
      ))}
    </section>
  );
}
