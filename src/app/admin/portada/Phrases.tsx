import type { Category } from "@/lib/types";
import type { SitePhrase } from "@/lib/phrases";
import { addPhrase, deletePhrase, togglePhrase, updatePhrase } from "./phrase-actions";

const input = "min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2";

/** Frases del título: la portada y una lista por categoría. Se muestra una al azar en cada visita. */
export function Phrases({ phrases, categories, missing }: { phrases: SitePhrase[]; categories: Category[]; missing: boolean }) {
  const groups = [{ slug: "", name: "Portada" }, ...categories.map((c) => ({ slug: c.slug, name: c.name }))];
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-black">Frases del título</h2>
        <p className="text-muted">
          El título grande de la portada y de cada categoría sale de estas listas: en cada visita se muestra una al azar.
          Escríbelas pensando en quien compra.
        </p>
      </div>
      {missing && (
        <p className="rounded-2xl bg-brand-soft p-4 text-sm font-bold">
          Para editarlas falta correr supabase/migrations/20261114130000_frases_titulo.sql en Supabase. Mientras tanto se
          usan las frases por defecto de src/lib/phrases.ts.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map((g) => {
          const list = phrases.filter((p) => (p.category_slug ?? "") === g.slug);
          return (
            <details key={g.slug} open={g.slug === ""} className="rounded-2xl border border-border bg-card p-4 md:col-span-1">
              <summary className="cursor-pointer font-black">
                {g.name} <span className="font-semibold text-muted">· {list.length} {list.length === 1 ? "frase" : "frases"}</span>
              </summary>
              <ul className="mt-3 space-y-2">
                {list.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2">
                    <form action={updatePhrase} className="flex min-w-0 flex-1 gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <input name="text" defaultValue={p.text} maxLength={120} className={`${input} ${p.active ? "" : "text-muted line-through"}`} />
                      <button className="rounded-full px-3 text-sm font-bold hover:bg-surface">Guardar</button>
                    </form>
                    <form action={togglePhrase}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="active" value={p.active ? "0" : "1"} />
                      <button className="rounded-full px-3 py-2 text-sm font-bold text-muted hover:bg-surface">{p.active ? "Ocultar" : "Mostrar"}</button>
                    </form>
                    <form action={deletePhrase}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="rounded-full px-3 py-2 text-sm font-bold text-pass hover:bg-surface">Quitar</button>
                    </form>
                  </li>
                ))}
                {list.length === 0 && <li className="text-sm text-muted">Sin frases: se usan las de src/lib/phrases.ts.</li>}
              </ul>
              {!missing && (
                <form action={addPhrase} className="mt-3 flex gap-2">
                  <input type="hidden" name="category" value={g.slug} />
                  <input name="text" required minLength={2} maxLength={120} placeholder="Nueva frase…" className={input} />
                  <button className="rounded-full bg-brand px-4 text-sm font-extrabold text-white">Agregar</button>
                </form>
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}
