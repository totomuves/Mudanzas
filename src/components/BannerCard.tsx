import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { HomeBanner } from "@/lib/types";

type Look = { box: string; button: string; eyebrow: string; style?: CSSProperties };

/** Colores planos sugeridos (paleta del logo) */
export const FLAT_COLORS = [
  { hex: "#5b3fe0", label: "Morado" },
  { hex: "#e0609a", label: "Rosado" },
  { hex: "#0b8f86", label: "Turquesa" },
  { hex: "#17151f", label: "Casi negro" },
  { hex: "#efebfd", label: "Lila suave" },
  { hex: "#fbe4ee", label: "Rosado suave" },
  { hex: "#dff5f2", label: "Turquesa suave" },
  { hex: "#f5f4f1", label: "Gris claro" },
];

/** true si el color es claro (el texto va oscuro encima) */
function isLight(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

/** Look del color plano: texto blanco o casi negro según qué se lea mejor */
function flatLook(hex: string): Look {
  const light = isLight(hex);
  return light
    ? { box: "text-[#17151f]", button: "bg-[#17151f] text-white", eyebrow: "text-[#17151f]/70", style: { backgroundColor: hex } }
    : { box: "text-white", button: "bg-white text-[#17151f]", eyebrow: "text-white/80", style: { backgroundColor: hex } };
}

const STYLES: Record<Exclude<HomeBanner["style"], "plano">, Look> = {
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

type BannerContent = Pick<HomeBanner, "eyebrow" | "title" | "subtitle" | "cta_label" | "href" | "image_url" | "image_layout" | "style" | "bg_color">;

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Banner grande. El contenido se edita en /admin/portada (inicio) y /admin/paginas (Mudanzas y Conócenos).
 * Cuatro formas: foto completa, media foto (con degradado o color al lado), degradado o color plano.
 */
export function BannerCard({ banner, priority = false }: { banner: BannerContent; priority?: boolean }) {
  const full = !!banner.image_url && banner.image_layout === "completa";
  // Con foto completa el texto va en blanco sobre una sombra, para que se lea con cualquier foto
  const s: Look = full
    ? { box: "bg-foreground text-white", button: "bg-white text-[#17151f]", eyebrow: "text-white/80" }
    : banner.style === "plano"
      ? flatLook(banner.bg_color && HEX.test(banner.bg_color) ? banner.bg_color : "#5b3fe0")
      : STYLES[banner.style] ?? STYLES.aurora;
  // Sin texto de botón o sin enlace, el banner es solo para mostrar
  const href = banner.cta_label && banner.href ? banner.href : null;
  const external = !!href?.startsWith("http");
  const className = `group relative grid min-h-48 overflow-hidden rounded-card md:min-h-72 ${s.box} ${
    banner.image_url && !full ? "grid-cols-[1fr_40%] md:grid-cols-2" : ""
  }`;
  const body = (
    <>
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
        {href && (
          <span className={`mt-2 inline-flex w-fit rounded-full px-5 py-2.5 text-sm font-extrabold transition group-hover:opacity-90 ${s.button}`}>
            {banner.cta_label}
          </span>
        )}
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
    </>
  );
  if (!href) {
    return <div className={className} style={s.style}>{body}</div>;
  }
  return (
    <Link href={href} {...(external ? { target: "_blank", rel: "noopener" } : {})} className={className} style={s.style}>
      {body}
    </Link>
  );
}
