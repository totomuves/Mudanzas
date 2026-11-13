import Link from "next/link";
import { Icon } from "@/components/Icon";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-2 rounded-2xl bg-foreground p-2 text-sm font-bold text-background">
        <span className="flex items-center gap-1.5 px-3"><Icon name="tools" className="h-4 w-4" strokeWidth={2.2} />Admin</span>
        <Link href="/admin" className="rounded-xl px-3 py-1.5 hover:bg-white/10">Productos</Link>
        <Link href="/admin/nuevo" className="rounded-xl px-3 py-1.5 hover:bg-white/10">+ Subir producto</Link>
        <Link href="/admin/pedidos" className="rounded-xl px-3 py-1.5 hover:bg-white/10">Pedidos</Link>
        <Link href="/admin/portada" className="rounded-xl px-3 py-1.5 hover:bg-white/10">Portada</Link>
        <Link href="/admin/recomendador" className="rounded-xl px-3 py-1.5 hover:bg-white/10">Recomendador</Link>
        <Link href="/admin/mudanzas" className="rounded-xl px-3 py-1.5 hover:bg-white/10">Agenda mudanzas</Link>
        <Link href="/admin/equipo" className="rounded-xl px-3 py-1.5 hover:bg-white/10">Equipo</Link>
      </nav>
      {children}
    </div>
  );
}
