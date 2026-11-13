import Image from "next/image";
import Link from "next/link";
import type { HomeBanner } from "@/lib/types";

const STYLES: Record<HomeBanner["style"], { box: string; button: string; eyebrow: string }> = {
  suave: { box: "bg-brand-soft text-foreground", button: "bg-brand text-white", eyebrow: "text-foreground/70" },
  marca: { box: "bg-brand text-white", button: "bg-white text-foreground", eyebrow: "text-white/80" },
  oscuro: { box: "bg-foreground text-background", button: "bg-background text-foreground", eyebrow: "text-background/70" },
};

type BannerContent = Pick<HomeBanner, "eyebrow" | "title" | "subtitle" | "cta_label" | "href" | "image_url" | "style">;

/** Banner grande de la portada. El contenido se edita en /admin/portada. */
export function BannerCard({ banner, priority = false }: { banner: BannerContent; priority?: boolean }) {
  const s = STYLES[banner.style] ?? STYLES.suave;
  const external = banner.href.startsWith("http");
  return (
    <Link
      href={banner.href}
      {...(external ? { target: "_blank", rel: "noopener" } : {})}
      className={`group grid min-h-48 overflow-hidden rounded-card md:min-h-72 ${s.box} ${
        banner.image_url ? "grid-cols-[1fr_40%] md:grid-cols-2" : ""
      }`}
    >
      <div className="flex flex-col justify-end gap-2 p-5 md:p-10">
        {banner.eyebrow && (
          <p className={`text-xs font-bold uppercase tracking-widest ${s.eyebrow}`}>{banner.eyebrow}</p>
        )}
        <h2 className="text-2xl font-black leading-[1.1] md:text-4xl">{banner.title}</h2>
        {banner.subtitle && <p className="max-w-md text-sm opacity-85 md:text-lg">{banner.subtitle}</p>}
        <span className={`mt-2 inline-flex w-fit rounded-full px-5 py-2.5 text-sm font-extrabold transition group-hover:opacity-90 ${s.button}`}>
          {banner.cta_label}
        </span>
      </div>
      {banner.image_url && (
        <div className="relative">
          <Image
            src={banner.image_url}
            alt=""
            fill
            priority={priority}
            sizes="(max-width: 768px) 40vw, 500px"
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        </div>
      )}
    </Link>
  );
}
