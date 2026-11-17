import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { brand } from "@/brand";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/Icon";
import { PageBanners } from "@/components/PageBanners";
import { PhotoGallery, type GalleryPhoto } from "@/components/PhotoGallery";
import { getPagePhotos, getPageBanners } from "@/lib/data";
import type { HomeBanner } from "@/lib/types";
import { FOUNDER, PROMISES, SERVICES, VEHICLE } from "@/lib/conocenos";
import { getReviews } from "@/lib/google-reviews";
import { GoogleReviews, Stars } from "@/components/GoogleReviews";

export const metadata: Metadata = {
  title: "Conócenos · Mudanzas",
  description:
    "Fletes y mudanzas en Santiago con atención directa, precio conversado antes de salir y una Sprinter cerrada de 10 m³. 5,0 en Google.",
};

// Se rehace cada 10 minutos (por las fotos y banners que se editan en /admin/paginas)
export const revalidate = 600;

async function getPageData() {
  if (!hasSupabaseEnv()) return { works: [] as GalleryPhoto[], banners: [] as HomeBanner[], whatsapp: null as string | null };
  const supabase = await createClient();
  // Si todavía no se corren las migraciones, las tablas no existen: esas secciones simplemente no se muestran
  const [works, banners, settings] = await Promise.all([
    getPagePhotos("conocenos"),
    getPageBanners("conocenos"),
    supabase.from("moving_settings").select("whatsapp").eq("id", 1).maybeSingle(),
  ]);
  return {
    works,
    banners,
    whatsapp: settings.data?.whatsapp?.replace(/\D/g, "") || null,
  };
}

export default async function ConocenosPage() {
  const [{ works, banners, whatsapp }, reviews] = await Promise.all([getPageData(), getReviews()]);
  const waHref = whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola ${brand.name}, quiero cotizar una mudanza.`)}`
    : null;

  return (
    <div className="space-y-16">
      {/* Portada con degradado del logo y foto del vehículo */}
      <section className="grid overflow-hidden rounded-card bg-[linear-gradient(120deg,#5b3fe0_0%,#8f5ce0_45%,#e0609a_100%)] text-white md:grid-cols-[1.05fr_1fr]">
        <div className="flex flex-col justify-center gap-4 p-6 md:p-12">
          <p className="text-xs font-bold uppercase tracking-widest text-white/80">Mudanzas {brand.name}</p>
          <h1 className="text-4xl font-black leading-tight md:text-5xl">Tus cosas, en buenas manos.</h1>
          <p className="text-lg text-white/90">
            Fletes y mudanzas en Santiago con atención directa, precio conversado antes de salir y una Sprinter cerrada que cuida tu carga.
          </p>
          <a href="#resenas" className="flex w-fit items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-bold backdrop-blur hover:bg-white/25">
            <Stars color="text-white" />
            <span>{reviews.rating} en Google{reviews.count ? ` · ${reviews.count} reseñas` : " · clientes reales"}</span>
          </a>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/mudanzas/cotizar" className="rounded-full bg-white px-6 py-3 font-extrabold text-[#17151f] transition hover:bg-white/90">
              Cotizar mi mudanza
            </Link>
            {waHref && (
              <a href={waHref} target="_blank" rel="noopener" className="flex items-center gap-2 rounded-full border-2 border-white/70 px-6 py-3 font-extrabold hover:bg-white/10">
                <Icon name="chat" className="h-5 w-5" strokeWidth={2} />WhatsApp
              </a>
            )}
          </div>
        </div>
        <div className="relative min-h-56 md:min-h-full">
          <Image src={VEHICLE.photo} alt={`${VEHICLE.name} de ${brand.name}`} fill priority sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
        </div>
      </section>

      {/* Banners de arriba (se editan en /admin/paginas) */}
      <PageBanners banners={banners} placement="arriba" />

      {/* Compromisos */}
      <section className="space-y-5">
        <h2 className="text-2xl font-black">Por qué confiar en nosotros</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PROMISES.map((p) => (
            <li key={p.title} className="rounded-card bg-surface p-5">
              <Icon name={p.icon} className="h-7 w-7 text-brand" strokeWidth={1.6} />
              <h3 className="mt-3 font-extrabold">{p.title}</h3>
              <p className="mt-1 text-sm text-muted">{p.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* El vehículo */}
      <section className="grid gap-6 md:grid-cols-2 md:items-center">
        <div className="relative aspect-[2/1] overflow-hidden rounded-card bg-surface">
          <Image src={VEHICLE.photo} alt={VEHICLE.name} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
        </div>
        <div className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">El vehículo</p>
          <h2 className="text-3xl font-black">{VEHICLE.name}</h2>
          <p className="text-muted">{VEHICLE.intro}</p>
          <dl className="grid grid-cols-2 gap-3">
            {VEHICLE.specs.map((s) => (
              <div key={s.label} className="flex gap-3 rounded-card border border-border p-3">
                <Icon name={s.icon} className="mt-0.5 h-5 w-5 shrink-0 text-brand" strokeWidth={1.8} />
                <div>
                  <dt className="text-xs text-muted">{s.label}</dt>
                  <dd className="text-sm font-extrabold">{s.value}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="rounded-card bg-brand-soft p-6 md:p-8">
        <div className="flex items-center gap-2">
          <Icon name="ruler" className="h-5 w-5" strokeWidth={1.8} />
          <h2 className="text-lg font-black">¿Cuánto cabe?</h2>
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {VEHICLE.sizes.map((s) => (
            <li key={s.label} className="rounded-card bg-card p-4">
              <p className="font-extrabold">{s.label}</p>
              <p className="text-sm text-muted">{s.value}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Trabajos realizados (se llena desde /admin/paginas) */}
      <PhotoGallery photos={works} eyebrow="Trabajos realizados" title="Así trabajamos" />

      {/* Servicios */}
      <section className="space-y-5">
        <h2 className="text-2xl font-black">Lo que hacemos</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s) => (
            <li key={s.title} className="flex gap-4 rounded-card border border-border bg-card p-5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface">
                <Icon name={s.icon} className="h-6 w-6" strokeWidth={1.6} />
              </span>
              <div>
                <h3 className="font-extrabold">{s.title}</h3>
                <p className="text-sm text-muted">{s.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Reseñas (mismo componente que bajo el cotizador) */}
      <GoogleReviews id="resenas" data={reviews} />

      {/* Quién está detrás */}
      <section className="grid gap-6 rounded-card border border-border p-6 md:grid-cols-[auto_1fr] md:items-center md:p-10">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[linear-gradient(135deg,#5b3fe0,#0b8f86)] text-2xl font-black text-white" aria-hidden>
          {FOUNDER.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
        </span>
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Quién está detrás</p>
          <h2 className="text-2xl font-black">{FOUNDER.name}</h2>
          <p className="text-sm font-bold text-brand">{FOUNDER.role}</p>
          <p className="text-muted">{FOUNDER.text}</p>
        </div>
      </section>

      {/* Modelo MUVEO: lo que no te llevas tiene segunda vida */}
      <section className="grid gap-6 rounded-card bg-[linear-gradient(120deg,#e4ddff_0%,#fbd9e8_55%,#c9f2ee_100%)] p-6 text-[#17151f] md:grid-cols-[1fr_auto] md:items-center md:p-10">
        <div className="space-y-2">
          <Icon name="recycle" className="h-8 w-8" strokeWidth={1.6} />
          <h2 className="text-2xl font-black">Lo que no te llevas, tiene segunda vida</h2>
          <p className="max-w-2xl text-[#17151f]/80">
            Si en la mudanza hay cosas que ya no quieres, cuéntanos. Las revisamos ese mismo día y lo que aceptamos lo llevamos en el mismo viaje.
            Termina en la tienda {brand.name} a precios muy bajos, para que otra casa lo aproveche.
          </p>
        </div>
        <Link href="/descubrir" className="flex w-fit items-center gap-2 rounded-full bg-[#5b3fe0] px-6 py-3 font-extrabold text-white hover:opacity-90">
          Ver la tienda <Icon name="arrow" className="h-4 w-4" strokeWidth={2.2} />
        </Link>
      </section>

      {/* Banners de abajo (se editan en /admin/paginas) */}
      <PageBanners banners={banners} placement="abajo" />

      {/* Cierre */}
      <section className="rounded-card bg-[linear-gradient(120deg,#0b8f86_0%,#3f6fd8_55%,#5b3fe0_100%)] p-6 text-center text-white md:p-12">
        <h2 className="text-3xl font-black">¿Listo para moverte?</h2>
        <p className="mx-auto mt-2 max-w-xl text-white/90">Cuéntanos tu ruta, fecha y lo que llevas. Confirmamos el valor contigo antes de salir.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/mudanzas/cotizar" className="rounded-full bg-white px-6 py-3 font-extrabold text-[#17151f] hover:bg-white/90">
            Cotizar mi mudanza
          </Link>
          {waHref && (
            <a href={waHref} target="_blank" rel="noopener" className="flex items-center gap-2 rounded-full border-2 border-white/70 px-6 py-3 font-extrabold hover:bg-white/10">
              <Icon name="chat" className="h-5 w-5" strokeWidth={2} />Escribir por WhatsApp
            </a>
          )}
        </div>
      </section>
    </div>
  );
}
