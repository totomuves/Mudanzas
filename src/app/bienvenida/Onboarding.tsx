"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { COMUNAS } from "@/lib/comunas";
import { formatCLP } from "@/lib/format";
import type { Category, Profile } from "@/lib/types";

const BUDGETS = [20000, 50000, 100000, 200000, 500000];

export function Onboarding({
  categories,
  initialSelected,
  profile,
}: {
  categories: Category[];
  initialSelected: string[];
  profile: Profile | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [comuna, setComuna] = useState(profile?.comuna ?? "");
  const [budget, setBudget] = useState<number | null>(profile?.budget_max ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(slug: string) {
    setSelected((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    try {
      let {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        // Entrar sin registro: Supabase crea un usuario anónimo
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) throw new Error("No pudimos iniciar tu sesión. ¿Están activados los usuarios anónimos en Supabase?");
        user = data.user;
      }
      if (!user) throw new Error("No pudimos iniciar tu sesión.");

      const { error: pErr } = await supabase
        .from("profiles")
        .update({ comuna: comuna || null, budget_max: budget, onboarded: true })
        .eq("id", user.id);
      if (pErr) throw pErr;

      if (selected.length > 0) {
        const { error: ucErr } = await supabase.from("user_categories").upsert(
          selected.map((slug) => ({ user_id: user.id, category_slug: slug, selected: true })),
          { onConflict: "user_id,category_slug" },
        );
        if (ucErr) throw ucErr;
      }
      const unselected = categories.map((c) => c.slug).filter((s) => !selected.includes(s));
      if (unselected.length > 0) {
        await supabase
          .from("user_categories")
          .update({ selected: false })
          .eq("user_id", user.id)
          .in("category_slug", unselected);
      }

      router.push("/descubrir");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo salió mal, intenta de nuevo.");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex gap-2" aria-hidden>
        <div className="h-1.5 flex-1 rounded-full bg-brand" />
        <div className={`h-1.5 flex-1 rounded-full ${step === 2 ? "bg-brand" : "bg-border"}`} />
      </div>

      {step === 1 ? (
        <section className="space-y-5">
          <div>
            <h1 className="text-3xl font-black">¿Qué necesitas para tu casa? 🏡</h1>
            <p className="mt-1 text-muted">
              Elige todo lo que te interese. Después, con cada swipe, la app aprende tus gustos.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {categories.map((c) => {
              const on = selected.includes(c.slug);
              return (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => toggle(c.slug)}
                  aria-pressed={on}
                  className={`flex flex-col items-center gap-1 rounded-2xl border-2 p-4 font-bold transition active:scale-95 ${
                    on ? "border-brand bg-brand/10 shadow-md" : "border-border bg-card"
                  }`}
                >
                  <span className={`text-4xl transition ${on ? "scale-110" : ""}`}>{c.emoji}</span>
                  <span className="text-center text-sm">{c.name}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={selected.length === 0}
            className="w-full rounded-full bg-brand py-4 text-lg font-extrabold text-white disabled:opacity-40"
          >
            {selected.length === 0 ? "Elige al menos una" : `Continuar (${selected.length})`}
          </button>
        </section>
      ) : (
        <section className="space-y-6">
          <div>
            <h1 className="text-3xl font-black">Un par de datos más 📍</h1>
            <p className="mt-1 text-muted">Así te mostramos primero lo que te queda cerca y en tu presupuesto. Puedes saltarte esto.</p>
          </div>

          <label className="block space-y-2">
            <span className="font-bold">¿En qué comuna estás?</span>
            <span className="block text-sm text-muted">Te mostramos productos de todas partes; si eliges tu comuna, los cercanos aparecen primero.</span>
            <select
              value={comuna}
              onChange={(e) => setComuna(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-4 py-3"
            >
              <option value="">📍 Todas las comunas</option>
              {COMUNAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="space-y-2">
            <legend className="font-bold">¿Cuánto quieres gastar como máximo por producto?</legend>
            <div className="flex flex-wrap gap-2">
              {BUDGETS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBudget(b)}
                  className={`rounded-full border-2 px-4 py-2 font-bold ${
                    budget === b ? "border-brand bg-brand text-white" : "border-border bg-card"
                  }`}
                >
                  {formatCLP(b)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setBudget(null)}
                className={`rounded-full border-2 px-4 py-2 font-bold ${
                  budget === null ? "border-brand bg-brand text-white" : "border-border bg-card"
                }`}
              >
                Sin límite
              </button>
            </div>
          </fieldset>

          {error && <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{error}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-full border-2 border-border px-6 py-4 font-extrabold"
            >
              Atrás
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex-1 rounded-full bg-brand py-4 text-lg font-extrabold text-white disabled:opacity-60"
            >
              {saving ? "Guardando…" : "¡A descubrir! 🔥"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
