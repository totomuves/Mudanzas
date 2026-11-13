import Link from "next/link";
import type { Category } from "@/lib/types";

const LEVELS = [
  { min: 0, name: "Recién llegado", icon: "🐣" },
  { min: 10, name: "Explorador", icon: "🧭" },
  { min: 30, name: "Cazador de tesoros", icon: "🏹" },
  { min: 75, name: "Experto en mudanzas", icon: "🏆" },
];

/** Muestra en vivo lo que la app está aprendiendo de los gustos del usuario. */
export function TasteMeter({
  categories,
  weights,
  swipeCount,
}: {
  categories: Category[];
  weights: Record<string, number>;
  swipeCount: number;
}) {
  const top = categories
    .map((c) => ({ ...c, w: weights[c.slug] ?? 0 }))
    .filter((c) => c.w > 0)
    .sort((a, b) => b.w - a.w)
    .slice(0, 4);
  const max = Math.max(1, ...top.map((t) => t.w));
  const level = [...LEVELS].reverse().find((l) => swipeCount >= l.min) ?? LEVELS[0];
  const next = LEVELS.find((l) => l.min > swipeCount);
  const knowledge = Math.min(100, Math.round((swipeCount / 30) * 100));

  return (
    <aside className="space-y-4 rounded-3xl border border-border bg-card p-5 md:self-start">
      <div className="flex items-center gap-3">
        <span className="text-4xl">{level.icon}</span>
        <div>
          <p className="text-xs font-bold uppercase text-muted">Tu nivel</p>
          <p className="font-black">{level.name}</p>
          {next && (
            <p className="text-xs text-muted">
              {next.min - swipeCount} swipes más para {next.icon}
            </p>
          )}
        </div>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs font-bold">
          <span>Te estoy conociendo</span>
          <span>{knowledge}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-gradient-to-r from-brand to-rose-500 transition-all" style={{ width: `${knowledge}%` }} />
        </div>
      </div>

      {top.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase text-muted">Lo que más te gusta</p>
          {top.map((t) => (
            <div key={t.slug} className="flex items-center gap-2 text-sm">
              <span className="w-6 text-center">{t.emoji}</span>
              <span className="w-24 truncate font-bold">{t.name}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(t.w / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <Link href="/bienvenida" className="block text-center text-sm font-bold text-brand">
        Cambiar mis categorías
      </Link>
    </aside>
  );
}
