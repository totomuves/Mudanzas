import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { brand } from "@/brand";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/Icon";
import { FOUNDER, GOOGLE_RATING, GOOGLE_REVIEWS_URL, PROMISES, REVIEWS, SERVICES, VEHICLE } from "@/lib/conocenos";

export const metadata: Metadata = {
  title: "Conócenos · Mudanzas",
  description:
    "Fletes y mudanzas en Santiago con atención directa, precio conversado antes de salir y una Sprinter cerrada de 10 m³. 5,0 en Google.",
};

// Se rehace cada 10 minutos (por las fotos de trabajos realizados)
export const revalidate = 600;

type MovingWork = { id: string; image_url: string; title: string | null; caption: string | null };

async function getPageData() {
  if (!hasSupabaseEnv()) return { works: [] as MovingWork[], whatsapp: null as string | null };
  const supabase = await createClient();
  const [works, settings] = await Promise.all([
    supabase.from("moving_works").select("id, image_url, title, caption").eq("active", true).order("sort_order").order("created_at"),
    supabase.from("moving_settings").select("whatsapp").eq("id", 1).maybeSingle(),
  ]);
  // Si todavía no se corre la migración, la tabla no existe: la sección simplemente no se muestra
  return {
    works: (works.data ?? []) as MovingWork[],
    whatsapp: settings.data?.whatsapp?.replace(/\D/g, "") || null,
  };
}

function Stars({ className = "h-4 w-4", color = "text-star" }: { className?: string; color?: string }) {
  return (
    <span className={`flex gap-0.5 ${color}`} aria-label="5 de 5 estrellas">
      {[0, 1, 2, 3, 4].map((i) => (
        <Icon key={i} name="star" className={`${className} fill-current`} strokeWidth={1.5} />
      ))}
    </span>
  );
}

export default async function ConocenosPage() {
  const { works, whatsapp } = await getPageData();
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
            <span>{GOOGLE_RATING} en Google · clientes reales</span>
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

      {/* Trabajos realizados (se llena desde /admin/mudanzas/trabajos) */}
      {works.length > 0 && (
        <section className="space-y-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted">Trabajos realizados</p>
            <h2 className="text-2xl font-black">Así trabajamos</h2>
          </div>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {works.map((w, i) => (
              <li key={w.id} className={i === 0 && works.length > 2 ? "col-span-2 row-span-2" : ""}>
                <figure className="group relative h-full min-h-40 overflow-hidden rounded-card bg-surface">
                  <Image
                    src={w.image_url}
                    alt={w.title ?? "Trabajo realizado"}
                    fill
                    sizes="(max-width: 768px) 50vw, 33vw"
                    className="object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                  {(w.title || w.caption) && (
                    <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-10 text-white">
                      {w.title && <p className="text-sm font-extrabold">{w.title}</p>}
                      {w.caption && <p className="text-xs text-white/85">{w.caption}</p>}
                    </figcaption>
                  )}
                </figure>
              </li>
            ))}
          </ul>
        </section>
      )}

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

      {/* Reseñas */}
      <section id="resenas" className="scroll-mt-24 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted">Reseñas en Google</p>
            <h2 className="text-2xl font-black">Lo que dicen nuestros clientes</h2>
          </div>
          <a href={GOOGLE_REVIEWS_URL} target="_blank" rel="noopener" className="flex items-center gap-3 rounded-full border border-border px-4 py-2 text-sm font-bold hover:bg-surface">
            <span className="text-xl font-black">{GOOGLE_RATING}</span>
            <Stars />
            <span className="flex items-center gap-1">Ver en Google <Icon name="external" className="h-4 w-4" strokeWidth={2} /></span>
          </a>
        </div>
        <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
          {REVIEWS.map((r) => (
            <li key={r.name} className="flex w-72 shrink-0 snap-start flex-col gap-3 rounded-card bg-surface p-5 md:w-auto">
              <div className="flex items-center justify-between">
                <Stars />
                <Icon name="quote" className="h-5 w-5 text-muted" strokeWidth={1.6} />
              </div>
              <blockquote className="flex-1 text-sm">“{r.text}”</blockquote>
              <p className="text-sm font-extrabold">{r.name}</p>
            </li>
          ))}
        </ul>
      </section>

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
