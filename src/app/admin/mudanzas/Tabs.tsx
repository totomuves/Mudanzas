import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin/mudanzas", label: "Agenda", icon: "calendar" },
  { href: "/admin/mudanzas/nueva", label: "Nueva mudanza", icon: "note" },
  { href: "/admin/mudanzas/posibles", label: "Posibles mudanzas", icon: "users" },
  { href: "/admin/mudanzas/servicios", label: "Servicios y precios", icon: "calculator" },
  { href: "/admin/mudanzas/ajustes", label: "Horarios y recargos", icon: "clock" },
  { href: "/admin/paginas?pagina=mudanzas", label: "Banners y fotos", icon: "image" },
];

/** Pestañas de la sección de mudanzas del admin. */
export function MudanzasTabs({ active }: { active: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-full bg-surface p-1 text-sm font-bold">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 ${active === t.href ? "bg-card shadow-sm" : "text-muted hover:text-foreground"}`}
        >
          <Icon name={t.icon} className="h-4 w-4" />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
