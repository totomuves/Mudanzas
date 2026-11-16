import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin/despacho/rutas", label: "Rutas del día", icon: "route" },
  { href: "/admin/despacho/ajustes", label: "Vehículos y horarios", icon: "truck" },
  { href: "/admin/despacho", label: "Precios por comuna", icon: "pin" },
];

export function DespachoTabs({ active }: { active: string }) {
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
