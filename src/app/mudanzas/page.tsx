import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/brand";
import { hasSupabaseEnv } from "@/lib/env";
import { getMovingData } from "@/lib/data";
import { formatCLP } from "@/lib/format";
import { DISTANCES } from "@/lib/moving";
import { SetupNotice } from "@/components/SetupNotice";

export const metadata: Metadata = {
  title: "Mudanzas",
  description: "Cotiza y reserva tu mudanza en minutos. Precios claros, equipo propio y protección de muebles.",
};

const STEPS = [
  { icon: "🧮", title: "Cotiza en línea", text: "Elige el tipo de mudanza, pisos y extras. Ves el precio al instante." },
  { icon: "📅", title: "Reserva tu hora", text: "Escoge el día y bloque que te acomode según nuestra disponibilidad." },
  { icon: "📞", title: "Te confirmamos", text: "Te escribimos por WhatsApp para revisar detalles y confirmar." },
  { icon: "📦", title: "Nos mudamos", text: "Llegamos con camión, equipo y materiales para proteger tus cosas." },
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
      <section className="relative overflow-hidden rounded-card bg-gradient-to-br from-foreground to-slate-700 px-6 py-10 text-white md:px-12 md:py-16">
        <div className="max-w-xl space-y-4">
          <p className="text-sm font-bold uppercase tracking-widest text-white/70">Mudanzas {brand.name}</p>
          <h1 className="text-4xl font-black leading-tight md:text-5xl">Tu mudanza, sin estrés y con precio claro.</h1>
          <p className="text-lg text-white/85">Cotiza en un minuto, elige tu hora y nosotros nos encargamos del resto.</p>
          <Link href="/mudanzas/cotizar" className="inline-block rounded-full bg-brand px-6 py-3 font-extrabold text-white shadow-lg hover:scale-105">
            Cotizar y reservar
          </Link>
        </div>
        <div className="pointer-events-none absolute -right-4 bottom-0 hidden text-[170px] md:block" aria-hidden>🚚</div>
      </section>

      <section className="space-y-5">
        <h2 className="text-2xl font-black">Cómo trabajamos</h2>
        <ol className="grid gap-4 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-sm font-black text-white">{i + 1}</span>
                <span className="text-2xl">{s.icon}</span>
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
            <div key={s.slug} className="flex flex-col rounded-2xl border border-border bg-card p-5">
              <div className="text-4xl">{s.emoji}</div>
              <h3 className="mt-2 text-lg font-extrabold">{s.name}</h3>
              <p className="text-sm text-muted">{s.description}</p>
              <p className="mt-3 text-sm text-muted">Desde</p>
              <p className="text-2xl font-black">{formatCLP(s.base_price)}</p>
              <ul className="mt-3 flex-1 space-y-1 text-sm">
                {s.includes.map((inc) => (
                  <li key={inc}>✔️ {inc}</li>
                ))}
                <li className="text-muted">⏱️ ~{Number(s.est_hours).toLocaleString("es-CL")} h · {s.crew_size} {s.crew_size === 1 ? "persona" : "personas"}</li>
              </ul>
              <Link href={`/mudanzas/cotizar?servicio=${s.slug}`} className="mt-4 rounded-full border-2 border-brand py-2 text-center font-extrabold text-brand hover:bg-brand hover:text-white">
                Cotizar este
              </Link>
            </div>
          ))}
        </div>
        {settings && (
          <div className="rounded-2xl border border-border bg-card p-5 text-sm">
            <h3 className="mb-2 font-extrabold">Adicionales</h3>
            <ul className="grid gap-1 sm:grid-cols-2">
              {DISTANCES.filter((d) => settings.distance_prices[d.key]).map((d) => (
                <li key={d.key}>
                  📍 Distancia {d.label.toLowerCase()} ({d.hint}): +{formatCLP(settings.distance_prices[d.key])}
                </li>
              ))}
              <li>🪜 Cada piso por escalera (desde el 2º): +{formatCLP(settings.price_per_floor)}</li>
              <li>📦 Embalaje completo: +{settings.packing_pct}% del servicio</li>
              <li>🎹 Objeto pesado (piano, caja fuerte…): +{formatCLP(settings.heavy_item_price)} c/u</li>
              {settings.weekend_surcharge_pct > 0 && <li>📅 Sábados: +{settings.weekend_surcharge_pct}%</li>}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-black">Preguntas frecuentes</h2>
        <div className="space-y-2">
          {FAQ.map((f) => (
            <details key={f.q} className="rounded-2xl border border-border bg-card p-4">
              <summary className="cursor-pointer font-extrabold">{f.q}</summary>
              <p className="mt-2 text-sm text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-card bg-brand/10 p-6 text-center">
        <p className="text-lg font-extrabold">¿Te mudas y te sobran cosas? 🎁</p>
        <p className="text-sm text-muted">Lo que no quieras llevar puede encontrar nuevo dueño en nuestra tienda.</p>
        <Link href="/descubrir" className="mt-3 inline-block font-extrabold text-brand">Ver la tienda →</Link>
      </section>
    </div>
  );
}
