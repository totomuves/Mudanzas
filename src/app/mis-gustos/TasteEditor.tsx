"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { COMUNAS } from "@/lib/comunas";
import { formatCLP } from "@/lib/format";
import { splitTrait, traitLabel, TRAIT_GROUPS } from "@/lib/recsys/labels";
import type { Category, MovingContext, Profile, UserTaste } from "@/lib/types";
import { CategoryIcon, Icon } from "@/components/Icon";

const BUDGETS = [20000, 50000, 100000, 200000, 500000];

type Adjust = -1 | 0 | 1;

export function TasteEditor({
  userId,
  categories,
  taste,
  profile,
  contexts,
  initialPrefs,
  initialSelected,
  likes,
}: {
  userId: string;
  categories: Category[];
  taste: UserTaste | null;
  profile: Profile;
  contexts: MovingContext[];
  initialPrefs: Record<string, number>;
  initialSelected: string[];
  likes: number;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [prefs, setPrefs] = useState<Record<string, number>>(initialPrefs);
  const [context, setContext] = useState<string[]>(profile.context ?? []);
  const [comuna, setComuna] = useState(profile.comuna ?? "");
  const [budget, setBudget] = useState<number | null>(profile.budget_max);
  const [saved, setSaved] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const catNames = useMemo(() => Object.fromEntries(categories.map((c) => [c.slug, c.name])), [categories]);
  const traits = useMemo(() => taste?.traits ?? {}, [taste]);
  const affinity = (t: string) => traits[t]?.a ?? 0;

  // Cuánto te conoce la app: crece con la evidencia (no solo con swipes)
  const events = taste?.n_events ?? 0;
  const knowledge = Math.min(100, Math.round((events / 40) * 100));

  function flash(msg: string) {
    setSaved(msg);
    setTimeout(() => setSaved(null), 1600);
  }

  async function setAdjust(trait: string, adjust: Adjust) {
    setPrefs((p) => {
      const next = { ...p };
      if (adjust === 0) delete next[trait];
      else next[trait] = adjust;
      return next;
    });
    const res =
      adjust === 0
        ? await supabase.from("user_trait_prefs").delete().eq("user_id", userId).eq("trait", trait)
        : await supabase
            .from("user_trait_prefs")
            .upsert({ user_id: userId, trait, adjust, updated_at: new Date().toISOString() }, { onConflict: "user_id,trait" });
    flash(res.error ? "No se pudo guardar" : "Guardado");
  }

  async function saveProfile(patch: Partial<Pick<Profile, "comuna" | "budget_max" | "context">>) {
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    flash(error ? "No se pudo guardar" : "Guardado");
  }

  async function resetAll() {
    setResetting(true);
    await Promise.all([
      supabase.from("user_events").delete().eq("user_id", userId),
      supabase.from("user_trait_prefs").delete().eq("user_id", userId),
      supabase.from("user_categories").update({ weight: 0 }).eq("user_id", userId),
    ]);
    await supabase.rpc("refresh_my_taste", { p_force: true });
    setPrefs({});
    setConfirmReset(false);
    setResetting(false);
    flash("Empezamos de cero");
    router.refresh();
  }

  // Resumen en palabras de lo aprendido
  const summary = useMemo(() => {
    const top = (kind: string, n: number) =>
      Object.entries(traits)
        .filter(([t, v]) => splitTrait(t).kind === kind && v.a > 0.2 && v.n >= 1)
        .sort((a, b) => b[1].a * Math.log1p(b[1].n) - a[1].a * Math.log1p(a[1].n))
        .slice(0, n)
        .map(([t]) => splitTrait(t).value);
    const cats = top("category", 2).map((s) => (catNames[s] ?? s).toLowerCase());
    const styles = top("style", 1);
    const materials = top("material", 1);
    const parts: string[] = [];
    if (cats.length) parts.push(`te interesa ${cats.join(" y ")}`);
    if (styles.length) parts.push(`con estilo ${styles[0]}`);
    if (materials.length) parts.push(`de ${materials[0]}`);
    return parts.length ? `Por lo que has visto, ${parts.join(", ")}.` : null;
  }, [traits, catNames]);

  const priceRange =
    taste?.price_mu != null && taste.price_sigma != null && (taste.n_pos ?? 0) >= 3
      ? [roundPrice(Math.exp(taste.price_mu - taste.price_sigma)), roundPrice(Math.exp(taste.price_mu + taste.price_sigma))]
      : null;

  const sortedCats = [...categories].sort((a, b) => affinity(`category:${b.slug}`) - affinity(`category:${a.slug}`));

  const liked = Object.entries(traits)
    .filter(([t, v]) => splitTrait(t).kind !== "category" && v.a > 0.15 && v.n >= 1)
    .sort((a, b) => b[1].a - a[1].a);
  const disliked = Object.entries(traits)
    .filter(([t, v]) => v.a < -0.25 && v.n >= 1 && !(prefs[t] === 1))
    .sort((a, b) => a[1].a - b[1].a)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-black">Mis gustos</h1>
        <div className="rounded-card border border-border bg-card p-5">
          <div className="mb-1 flex justify-between text-sm font-bold">
            <span>Te estoy conociendo</span>
            <span>{knowledge}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-2" style={{ width: `${knowledge}%` }} />
          </div>
          <p className="mt-3 text-sm text-muted">
            {summary ??
              "Aún sé poco de ti. Desliza en Descubrir, mira productos y busca en el catálogo: con cada cosa que haces aprendo qué te gusta."}
          </p>
          <p className="mt-2 text-xs text-muted">
            Aprendo de tus me gusta ({likes}), de lo que pasas, de cuánto rato miras cada producto, de lo que buscas y de lo que
            compras. Lo de hace semanas pesa menos que lo de hoy.
          </p>
        </div>
        {saved && (
          <p className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit rounded-full bg-foreground px-4 py-2 text-sm font-bold text-background shadow-lg md:bottom-8">
            {saved}
          </p>
        )}
      </header>

      {contexts.length > 0 && (
        <Section title="Tu situación" hint="Te mostramos primero lo que sirve para lo que estás armando.">
          <div className="flex flex-wrap gap-2">
            {contexts.map((c) => {
              const on = context.includes(c.slug);
              return (
                <button
                  key={c.slug}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const next = on ? context.filter((x) => x !== c.slug) : [...context, c.slug];
                    setContext(next);
                    saveProfile({ context: next });
                  }}
                  className={`rounded-full border-2 px-4 py-2 text-sm font-bold ${
                    on ? "border-foreground bg-foreground text-background" : "border-border bg-card"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Categorías" hint="La barra muestra cuánto te gusta según lo que has hecho. Puedes pedir más o dejar de ver una.">
        <ul className="divide-y divide-border">
          {sortedCats.map((c) => {
            const t = `category:${c.slug}`;
            const a = affinity(t);
            return (
              <li key={c.slug} className="flex flex-wrap items-center gap-3 py-3">
                <CategoryIcon slug={c.slug} className="h-6 w-6" />
                <div className="min-w-0 flex-1 basis-32">
                  <p className="flex flex-wrap items-center gap-x-1.5 font-bold">
                    {c.name}
                    {initialSelected.includes(c.slug) && <span className="text-xs font-semibold text-muted">· elegida al empezar</span>}
                  </p>
                  <AffinityBar a={a} />
                </div>
                <Segmented
                  value={(prefs[t] ?? 0) as Adjust}
                  onChange={(v) => setAdjust(t, v)}
                  labels={["Ocultar", "Normal", "Más"]}
                />
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        title="Lo que te gusta"
        hint="Lo descubrí mirando tus me gusta: estilos, materiales, colores y más. Si algo no es así, quítalo."
      >
        {liked.length === 0 ? (
          <p className="text-sm text-muted">Todavía no tengo claro tu estilo. Sigue deslizando.</p>
        ) : (
          <div className="space-y-4">
            {TRAIT_GROUPS.map((g) => {
              const items = liked.filter(([t]) => splitTrait(t).kind === g.kind);
              if (!items.length) return null;
              return (
                <div key={g.kind}>
                  <p className="mb-2 text-xs font-bold uppercase text-muted">{g.title}</p>
                  <div className="flex flex-wrap gap-2">
                    {items.map(([t, v]) => (
                      <TraitChip
                        key={t}
                        label={traitLabel(t, catNames)}
                        strength={v.a}
                        adjust={(prefs[t] ?? 0) as Adjust}
                        onAdjust={(x) => setAdjust(t, x)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {disliked.length > 0 && (
        <Section title="Lo que no te convence" hint="Te lo muestro menos. Si me equivoqué, dale otra oportunidad.">
          <div className="flex flex-wrap gap-2">
            {disliked.map(([t]) => (
              <span key={t} className="flex items-center gap-2 rounded-full border border-border bg-background py-1.5 pl-4 pr-1.5 text-sm font-bold">
                {traitLabel(t, catNames)}
                <button
                  type="button"
                  onClick={() => setAdjust(t, 1)}
                  className="rounded-full bg-surface px-3 py-1 text-xs font-bold hover:bg-border"
                >
                  Sí me gusta
                </button>
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section title="Precio" hint={priceRange ? undefined : "Cuando te gusten algunos productos más, te digo qué rango de precio prefieres."}>
        {priceRange && (
          <p className="mb-3 text-sm">
            Lo que más te gusta suele costar entre <b>{formatCLP(priceRange[0])}</b> y <b>{formatCLP(priceRange[1])}</b>.
          </p>
        )}
        <p className="mb-2 text-sm font-bold">Máximo por producto</p>
        <div className="flex flex-wrap gap-2">
          {[...BUDGETS, null].map((b) => (
            <button
              key={b ?? "sin"}
              type="button"
              onClick={() => {
                setBudget(b);
                saveProfile({ budget_max: b });
              }}
              className={`rounded-full border-2 px-4 py-2 text-sm font-bold ${
                budget === b ? "border-brand bg-brand text-white" : "border-border bg-card"
              }`}
            >
              {b == null ? "Sin límite" : formatCLP(b)}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Dónde estás" hint="Lo que está cerca aparece antes (es más fácil de retirar).">
        <select
          value={comuna}
          onChange={(e) => {
            setComuna(e.target.value);
            saveProfile({ comuna: e.target.value || null });
          }}
          className="w-full rounded-xl border border-border bg-card px-4 py-3"
        >
          <option value="">Todas las comunas</option>
          {COMUNAS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/descubrir" className="flex-1 rounded-full bg-brand py-3.5 text-center font-extrabold text-white">
          Ver lo que elegí para ti
        </Link>
        <Link href="/bienvenida" className="flex-1 rounded-full border-2 border-border py-3.5 text-center font-extrabold">
          Cambiar categorías elegidas
        </Link>
      </div>

      <section className="rounded-card border border-border p-5">
        <h2 className="font-black">Empezar de cero</h2>
        <p className="mt-1 text-sm text-muted">
          Borro todo lo que aprendí de ti (tus favoritos se mantienen). Útil si cambiaste de casa o de planes.
        </p>
        {confirmReset ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={resetAll}
              disabled={resetting}
              className="rounded-full bg-pass px-5 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
            >
              {resetting ? "Borrando…" : "Sí, borrar lo aprendido"}
            </button>
            <button type="button" onClick={() => setConfirmReset(false)} className="rounded-full px-5 py-2.5 text-sm font-bold text-muted">
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="mt-3 rounded-full border-2 border-border px-5 py-2.5 text-sm font-extrabold"
          >
            Empezar de cero
          </button>
        )}
      </section>
    </div>
  );
}

function roundPrice(n: number) {
  return Math.max(1000, Math.round(n / 1000) * 1000);
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-card p-5">
      <h2 className="text-lg font-black">{title}</h2>
      {hint && <p className="mb-3 mt-0.5 text-sm text-muted">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  );
}

/** Barra de -1 (no le gusta) a +1 (le encanta), con el centro en "neutral". */
function AffinityBar({ a }: { a: number }) {
  const pct = Math.min(1, Math.abs(a)) * 50;
  return (
    <div className="relative mt-1 h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-border" aria-hidden>
      <div className="absolute inset-y-0 left-1/2 w-px bg-muted/50" />
      <div
        className={`absolute inset-y-0 rounded-full ${a >= 0 ? "bg-accent" : "bg-pass"}`}
        style={a >= 0 ? { left: "50%", width: `${pct}%` } : { right: "50%", width: `${pct}%` }}
      />
    </div>
  );
}

function Segmented({
  value,
  onChange,
  labels,
}: {
  value: Adjust;
  onChange: (v: Adjust) => void;
  labels: [string, string, string];
}) {
  const opts: Adjust[] = [-1, 0, 1];
  return (
    <div className="flex rounded-full border border-border bg-background p-0.5 text-xs font-bold" role="group">
      {opts.map((o, i) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={`rounded-full px-3 py-1.5 ${
            value === o ? (o === -1 ? "bg-pass text-white" : o === 1 ? "bg-accent text-white" : "bg-foreground text-background") : "text-muted"
          }`}
        >
          {labels[i]}
        </button>
      ))}
    </div>
  );
}

function TraitChip({
  label,
  strength,
  adjust,
  onAdjust,
}: {
  label: string;
  strength: number;
  adjust: Adjust;
  onAdjust: (v: Adjust) => void;
}) {
  if (adjust === -1) {
    return (
      <span className="flex items-center gap-2 rounded-full border border-dashed border-border py-1.5 pl-4 pr-1.5 text-sm font-bold text-muted line-through">
        {label}
        <button type="button" onClick={() => onAdjust(0)} className="rounded-full bg-surface px-3 py-1 text-xs no-underline">
          Deshacer
        </button>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-surface py-1 pl-4 pr-1 text-sm font-bold">
      {label}
      <span className="ml-1 flex gap-0.5" aria-hidden>
        {[0.3, 0.55, 0.8].map((th) => (
          <span key={th} className={`h-2.5 w-1 rounded-full ${strength >= th ? "bg-accent" : "bg-border"}`} />
        ))}
      </span>
      <button
        type="button"
        title="Quiero ver más de esto"
        aria-label={`Más ${label}`}
        onClick={() => onAdjust(adjust === 1 ? 0 : 1)}
        className={`ml-1 flex h-7 w-7 items-center justify-center rounded-full ${adjust === 1 ? "bg-accent text-white" : "hover:bg-border"}`}
      >
        <Icon name="heart" className="h-3.5 w-3.5" strokeWidth={2.4} fill={adjust === 1 ? "currentColor" : undefined} />
      </button>
      <button
        type="button"
        title="No es lo mío"
        aria-label={`Quitar ${label}`}
        onClick={() => onAdjust(-1)}
        className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-border"
      >
        <Icon name="x" className="h-3.5 w-3.5" strokeWidth={2.6} />
      </button>
    </span>
  );
}
