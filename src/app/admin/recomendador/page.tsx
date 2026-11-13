import type { Metadata } from "next";
import { hasSupabaseEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/admin";
import { SetupNotice } from "@/components/SetupNotice";
import { Icon } from "@/components/Icon";
import { activeModel, activeProvider, PROVIDER_LABEL } from "@/lib/recsys/embeddings";
import { IndexButton } from "./IndexButton";

export const metadata: Metadata = { title: "Recomendador" };

const KIND_LABEL: Record<string, string> = {
  like: "Me gusta", superlike: "¡Lo quiero!", pass: "Paso", view: "Vio el detalle", share: "Compartió",
  checkout: "Empezó a pagar", purchase: "Compró", search: "Buscó",
};

export default async function RecomendadorAdminPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { supabase } = await requireAdmin();
  const model = activeModel();
  const since = sevenDaysAgo();

  const [products, features, featuresModel, events, tastes] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("product_features").select("product_id", { count: "exact", head: true }),
    supabase.from("product_features").select("product_id", { count: "exact", head: true }).eq("model", model),
    supabase.from("user_events").select("kind").gte("created_at", since).limit(5000),
    supabase.from("user_taste").select("user_id", { count: "exact", head: true }),
  ]);

  if (features.error) {
    return (
      <div className="rounded-card border border-border bg-card p-6">
        <h1 className="text-2xl font-black">Recomendador</h1>
        <p className="mt-2 text-muted">
          Falta correr la migración <code>20261114100000_recomendador.sql</code> en Supabase (SQL Editor).
        </p>
      </div>
    );
  }

  const total = products.count ?? 0;
  const ready = featuresModel.count ?? 0;
  const byKind: Record<string, number> = {};
  for (const e of (events.data ?? []) as { kind: string }[]) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
  const provider = activeProvider();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black">Recomendador</h1>
        <p className="text-muted">Cómo la app está conociendo a tus compradores.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Productos analizados" value={`${ready} de ${total}`} />
        <Stat label="Compradores con gustos aprendidos" value={String(tastes.count ?? 0)} />
        <Stat label="Señales esta semana" value={String((events.data ?? []).length)} />
      </div>

      <section className="space-y-3 rounded-card border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 font-black"><Icon name="sparkle" className="h-5 w-5" /> Cómo entiende los productos</h2>
        <Row
          label="Huella de parecido"
          value={PROVIDER_LABEL[provider]}
          hint={provider === "local" ? "Agrega GEMINI_API_KEY en Vercel (gratis en aistudio.google.com) para que entienda mejor qué productos se parecen." : undefined}
        />
        <Row
          label="Estilo, material y color"
          value={process.env.ANTHROPIC_API_KEY ? "Claude mirando la foto" : "Palabras clave del título"}
          hint={process.env.ANTHROPIC_API_KEY ? undefined : "Con ANTHROPIC_API_KEY la IA mira la foto y reconoce estilo, material y colores."}
        />
        {total - ready > 0 && (
          <p className="text-sm text-muted">
            {total - ready} productos por analizar. Se analizan solos de a poco; también puedes hacerlo ahora.
          </p>
        )}
        <IndexButton pending={total - ready} />
      </section>

      <section className="space-y-2 rounded-card border border-border bg-card p-5">
        <h2 className="font-black">Lo que hicieron los compradores (7 días)</h2>
        {Object.keys(byKind).length === 0 ? (
          <p className="text-sm text-muted">Aún no hay señales. Aparecen cuando la gente usa Descubrir, el catálogo o compra.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {Object.entries(byKind)
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => (
                <li key={k} className="flex justify-between py-2">
                  <span>{KIND_LABEL[k] ?? k}</span>
                  <span className="font-bold">{n}</span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function sevenDaysAgo() {
  return new Date(Date.now() - 7 * 86400_000).toISOString();
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <p className="text-xl font-black">{value}</p>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="text-sm">
      <div className="flex justify-between gap-4">
        <span className="text-muted">{label}</span>
        <span className="text-right font-bold">{value}</span>
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
