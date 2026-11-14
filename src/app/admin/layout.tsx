import Link from "next/link";
import { Icon } from "@/components/Icon";
import { getAdminAccess } from "@/lib/admin";
import { hasSupabaseEnv } from "@/lib/env";

type NavItem = { href: string; label: string; section: string };

const NAV: NavItem[] = [
  { href: "/admin", label: "Productos", section: "productos" },
  { href: "/admin/nuevo", label: "+ Subir producto", section: "productos" },
  { href: "/admin/pedidos", label: "Pedidos", section: "pedidos" },
  { href: "/admin/vendedores", label: "Vendedores", section: "vendedores" },
  { href: "/admin/portada", label: "Portada", section: "portada" },
  { href: "/admin/recomendador", label: "Recomendador", section: "recomendador" },
  { href: "/admin/mudanzas", label: "Agenda mudanzas", section: "mudanzas" },
  { href: "/admin/equipo", label: "Equipo", section: "equipo" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // El menú muestra solo las secciones que la persona tiene permitidas
  const sections: string[] = hasSupabaseEnv() ? (await getAdminAccess()).sections : [];
  const links = NAV.filter((n) => sections.includes(n.section));
  return (
    <div className="space-y-6">
      {links.length > 0 && (
        <nav className="flex flex-wrap items-center gap-2 rounded-2xl bg-foreground p-2 text-sm font-bold text-background">
          <span className="flex items-center gap-1.5 px-3"><Icon name="tools" className="h-4 w-4" strokeWidth={2.2} />Admin</span>
          {links.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-xl px-3 py-1.5 hover:bg-white/10">{n.label}</Link>
          ))}
        </nav>
      )}
      {children}
    </div>
  );
}
