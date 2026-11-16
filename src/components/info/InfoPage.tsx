import Link from "next/link";
import { brand } from "@/brand";
import { Icon, type IconName } from "@/components/Icon";

/** Páginas de ayuda y legales: mismo diseño para todas. */
export const INFO_PAGES: { href: string; label: string; icon: IconName }[] = [
  { href: "/envios", label: "Envíos y retiro", icon: "truck" },
  { href: "/devoluciones", label: "Cambios y devoluciones", icon: "undo" },
  { href: "/contacto", label: "Contacto", icon: "mail" },
  { href: "/terminos", label: "Términos y condiciones", icon: "note" },
  { href: "/privacidad", label: "Privacidad", icon: "lock" },
];

export function InfoPage({
  current,
  eyebrow,
  title,
  intro,
  highlights,
  children,
}: {
  current: string;
  eyebrow: string;
  title: string;
  intro: string;
  /** Resumen en tarjetas (lo más importante, en una mirada) */
  highlights?: { icon: IconName; title: string; text: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="relative overflow-hidden rounded-card bg-brand-soft px-6 py-8 md:px-10 md:py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-40 blur-3xl"
          style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-2))" }}
        />
        <p className="relative text-xs font-bold uppercase tracking-widest text-brand">{eyebrow}</p>
        <h1 className="relative mt-2 text-3xl font-black leading-tight md:text-4xl">{title}</h1>
        <p className="relative mt-3 max-w-xl text-muted md:text-lg">{intro}</p>
      </header>

      {highlights && highlights.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {highlights.map((h) => (
            <div key={h.title} className="rounded-card border border-border bg-card p-4">
              <Icon name={h.icon} className="h-6 w-6 text-brand" strokeWidth={1.8} />
              <p className="mt-2 font-extrabold leading-tight">{h.title}</p>
              <p className="mt-1 text-sm text-muted">{h.text}</p>
            </div>
          ))}
        </div>
      )}

      <article className="info-prose space-y-8">{children}</article>

      <p className="text-xs text-muted">Última actualización: {brand.legal.updatedAt}.</p>

      <nav aria-label="Ayuda" className="border-t border-border pt-6">
        <p className="mb-3 text-sm font-bold">También te puede servir</p>
        <ul className="flex flex-wrap gap-2">
          {INFO_PAGES.filter((p) => p.href !== current).map((p) => (
            <li key={p.href}>
              <Link href={p.href} className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-surface">
                <Icon name={p.icon} className="h-4 w-4" />
                {p.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <h2 className="text-xl font-black">{title}</h2>
      <div className="space-y-3 leading-relaxed text-foreground/85">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5">
          <Icon name="check" className="mt-1 h-4 w-4 shrink-0 text-accent" strokeWidth={2.4} />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

