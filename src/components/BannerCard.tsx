import Image from "next/image";
import Link from "next/link";
import type { HomeBanner } from "@/lib/types";

const STYLES: Record<HomeBanner["style"], { box: string; button: string; eyebrow: string }> = {
  // Degradados con los colores del logo (morado, rosado, turquesa)
  aurora: {
    box: "bg-[linear-gradient(120deg,#5b3fe0_0%,#8f5ce0_45%,#e0609a_100%)] text-white",
    button: "bg-white text-[#17151f]",
    eyebrow: "text-white/80",
  },
  laguna: {
    box: "bg-[linear-gradient(120deg,#0b8f86_0%,#3f6fd8_55%,#5b3fe0_100%)] text-white",
    button: "bg-white text-[#17151f]",
    eyebrow: "text-white/80",
  },
  pastel: {
    box: "bg-[linear-gradient(120deg,#e4ddff_0%,#fbd9e8_55%,#c9f2ee_100%)] text-[#17151f]",
    button: "bg-[#5b3fe0] text-white",
    eyebrow: "text-[#17151f]/70",
  },
  suave: { box: "bg-brand-soft text-foreground", button: "bg-brand text-white", eyebrow: "text-foreground/70" },
  marca: { box: "bg-brand text-white", button: "bg-white text-foreground", eyebrow: "text-white/80" },
  oscuro: { box: "bg-foreground text-background", button: "bg-background text-foreground", eyebrow: "text-background/70" },
};

type BannerContent = Pick<HomeBanner, "eyebrow" | "title" | "subtitle" | "cta_label" | "href" | "image_url" | "image_layout" | "style">;

/** Banner grande de la portada. El contenido se edita en /admin/portada. */
export function BannerCard({ banner, priority = false }: { banner: BannerContent; priority?: boolean }) {
  const full = !!banner.image_url && banner.image_layout === "completa";
  // Con foto completa el texto va en blanco sobre una sombra, para que se lea con cualquier foto
  const s = full
    ? { box: "bg-foreground text-white", button: "bg-white text-[#17151f]", eyebrow: "text-white/80" }
    : STYLES[banner.style] ?? STYLES.aurora;
  const external = banner.href.startsWith("http");
  return (
    <Link
      href={banner.href}
      {...(external ? { target: "_blank", rel: "noopener" } : {})}
      className={`group relative grid min-h-48 overflow-hidden rounded-card md:min-h-72 ${s.box} ${
        banner.image_url && !full ? "grid-cols-[1fr_40%] md:grid-cols-2" : ""
      }`}
    >
      {full && (
        <>
          <Image
            src={banner.image_url!}
            alt=""
            fill
            priority={priority}
            sizes="(max-width: 768px) 100vw, 1000px"
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/5 md:bg-gradient-to-r md:from-black/70 md:via-black/30 md:to-transparent" />
        </>
      )}
      <div className={`relative flex flex-col justify-end gap-2 p-5 md:p-10 ${full ? "min-h-56 md:min-h-80 md:max-w-[60%]" : ""}`}>
        {banner.eyebrow && (
          <p className={`text-xs font-bold uppercase tracking-widest ${s.eyebrow}`}>{banner.eyebrow}</p>
        )}
        <h2 className="text-2xl font-black leading-[1.1] md:text-4xl">{banner.title}</h2>
        {banner.subtitle && <p className="max-w-md text-sm opacity-85 md:text-lg">{banner.subtitle}</p>}
        <span className={`mt-2 inline-flex w-fit rounded-full px-5 py-2.5 text-sm font-extrabold transition group-hover:opacity-90 ${s.button}`}>
          {banner.cta_label}
        </span>
      </div>
      {banner.image_url && !full && (
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
