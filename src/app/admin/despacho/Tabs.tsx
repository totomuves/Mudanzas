import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";

type Tab = { href: string; label: string; icon: IconName };
const TABS: Tab[] = [
  { href: "/admin/despacho/rutas", label: "Rutas del día", icon: "route" },
  { href: "/admin/despacho/retiros", label: "Retiros", icon: "boxOpen" },
  { href: "/admin/despacho/ajustes", label: "Vehículos y horarios", icon: "truck" },
  { href: "/admin/despacho/bodegas", label: "Bodegas", icon: "warehouse" },
  { href: "/admin/despacho", label: "Precio de despacho", icon: "calculator" },
];

export const SELLER_TABS: Tab[] = [
  { href: "/vendedor/reparto", label: "Rutas del día", icon: "route" },
  { href: "/vendedor/reparto/ajustes", label: "Vehículos y horarios", icon: "truck" },
];

export function DespachoTabs({ active, tabs = TABS }: { active: string; tabs?: Tab[] }) {
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-full bg-surface p-1 text-sm font-bold">
      {tabs.map((t) => (
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
