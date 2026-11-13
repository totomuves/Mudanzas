import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/brand";
import { hasSupabaseEnv } from "@/lib/env";
import { getMovingData } from "@/lib/data";
import { formatCLP } from "@/lib/format";
import { DISTANCES } from "@/lib/moving";
import { SetupNotice } from "@/components/SetupNotice";
import { Icon, ServiceIcon, type IconName } from "@/components/Icon";

export const metadata: Metadata = {
  title: "Mudanzas",
  description: "Cotiza y reserva tu mudanza en minutos. Precios claros, equipo propio y protección de muebles.",
};

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "calculator", title: "Cotiza en línea", text: "Elige el tipo de mudanza, pisos y extras. Ves el precio al instante." },
  { icon: "calendar", title: "Reserva tu hora", text: "Escoge el día y bloque que te acomode según nuestra disponibilidad." },
  { icon: "phone", title: "Te confirmamos", text: "Te escribimos por WhatsApp para revisar detalles y confirmar." },
  { icon: "box", title: "Nos mudamos", text: "Llegamos con camión, equipo y materiales para proteger tus cosas." },
];

const FAQ = [
  { q: "¿El precio es final?", a: "Es una estimación según lo que nos cuentas. Si al confirmar vemos algo distinto (más volumen, accesos difíciles), te avisamos antes de la mudanza." },
  { q: "¿Cómo pago?", a: "Al confirmar te indicamos cómo pagar el abono. El saldo se paga el día de la mudanza." },
  { q: "¿Qué pasa con lo que no quiero llevar?", a: "Si está en buen estado, podemos llevárnoslo y darle una segunda vida en nuestra tienda." },
  { q: "¿Puedo cambiar la fecha?", a: "Sí, avísanos con al menos 48 horas y la movemos según disponibilidad." },
];

export default async function MudanzasPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { services, settings } = await getMovingData();

  return (
    <div className="space-y-14">
      <section className="relative overflow-hidden rounded-card bg-foreground px-6 py-10 text-background md:px-12 md:py-16">
        <div className="max-w-xl space-y-4">
          <p className="text-sm font-bold uppercase tracking-widest opacity-70">Mudanzas {brand.name}</p>
          <h1 className="text-4xl font-black leading-tight md:text-5xl">Tu mudanza, sin estrés y con precio claro.</h1>
          <p className="text-lg opacity-85">Cotiza en un minuto, elige tu hora y nosotros nos encargamos del resto.</p>
          <Link href="/mudanzas/cotizar" className="inline-block rounded-full bg-brand px-6 py-3 font-extrabold text-white transition hover:bg-brand-dark">
            Cotizar y reservar
          </Link>
        </div>
        <div className="pointer-events-none absolute -bottom-6 right-6 hidden opacity-90 md:block" aria-hidden>
          <Icon name="truck" className="h-56 w-56" strokeWidth={0.9} />
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="text-2xl font-black">Cómo trabajamos</h2>
        <ol className="grid gap-4 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-card bg-surface p-5">
              <div className="flex items-center justify-between">
                <Icon name={s.icon} className="h-7 w-7" strokeWidth={1.6} />
                <span className="text-sm font-black text-muted">Paso {i + 1}</span>
              </div>
              <h3 className="mt-2 font-extrabold">{s.title}</h3>
              <p className="text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-5">
        <h2 className="text-2xl font-black">Precios</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <div key={s.slug} className="flex flex-col rounded-card border border-border bg-card p-5">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface">
                <ServiceIcon slug={s.slug} />
              </span>
              <h3 className="mt-2 text-lg font-extrabold">{s.name}</h3>
              <p className="text-sm text-muted">{s.description}</p>
              <p className="mt-3 text-sm text-muted">Desde</p>
              <p className="text-2xl font-black">{formatCLP(s.base_price)}</p>
              <ul className="mt-3 flex-1 space-y-1 text-sm">
                {s.includes.map((inc) => (
                  <li key={inc} className="flex gap-2"><Icon name="check" className="mt-0.5 h-4 w-4 text-accent" strokeWidth={2.4} />{inc}</li>
                ))}
                <li className="flex gap-2 text-muted"><Icon name="clock" className="mt-0.5 h-4 w-4" strokeWidth={2} />~{Number(s.est_hours).toLocaleString("es-CL")} h · {s.crew_size} {s.crew_size === 1 ? "persona" : "personas"}</li>
              </ul>
              <Link href={`/mudanzas/cotizar?servicio=${s.slug}`} className="mt-4 rounded-full border-2 border-foreground py-2 text-center font-extrabold hover:bg-foreground hover:text-background">
                Cotizar este
              </Link>
            </div>
          ))}
        </div>
        {settings && (
          <div className="rounded-card bg-surface p-5 text-sm">
            <h3 className="mb-2 font-extrabold">Adicionales</h3>
            <ul className="grid gap-2 sm:grid-cols-2 [&>li]:flex [&>li]:gap-2">
              {DISTANCES.filter((d) => settings.distance_prices[d.key]).map((d) => (
                <li key={d.key}>
                  <Icon name="pin" className="mt-0.5 h-4 w-4" />Distancia {d.label.toLowerCase()} ({d.hint}): +{formatCLP(settings.distance_prices[d.key])}
                </li>
              ))}
              <li><Icon name="up" className="mt-0.5 h-4 w-4" />Cada piso por escalera (desde el 2º): +{formatCLP(settings.price_per_floor)}</li>
              <li><Icon name="box" className="mt-0.5 h-4 w-4" />Embalaje completo: +{settings.packing_pct}% del servicio</li>
              <li><Icon name="piano" className="mt-0.5 h-4 w-4" />Objeto pesado (piano, caja fuerte…): +{formatCLP(settings.heavy_item_price)} c/u</li>
              {settings.weekend_surcharge_pct > 0 && <li><Icon name="calendar" className="mt-0.5 h-4 w-4" />Sábados: +{settings.weekend_surcharge_pct}%</li>}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-black">Preguntas frecuentes</h2>
        <div className="space-y-2">
          {FAQ.map((f) => (
            <details key={f.q} className="border-b border-border py-4">
              <summary className="cursor-pointer font-extrabold">{f.q}</summary>
              <p className="mt-2 text-sm text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-card bg-brand-soft p-6 text-center">
        <Icon name="gift" className="mx-auto mb-2 h-8 w-8" strokeWidth={1.6} />
        <p className="text-lg font-extrabold">¿Te mudas y te sobran cosas?</p>
        <p className="text-sm text-muted">Lo que no quieras llevar puede encontrar nuevo dueño en nuestra tienda.</p>
        <Link href="/descubrir" className="mt-3 inline-flex items-center gap-1 font-extrabold underline underline-offset-4">Ver la tienda <Icon name="arrow" className="h-4 w-4" strokeWidth={2.2} /></Link>
      </section>
    </div>
  );
}
