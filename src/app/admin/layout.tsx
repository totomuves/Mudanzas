import Link from "next/link";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-2 rounded-2xl bg-foreground p-2 text-sm font-bold text-background">
        <span className="px-3">🛠️ Admin</span>
        <Link href="/admin" className="rounded-xl px-3 py-1.5 hover:bg-white/10">Productos</Link>
        <Link href="/admin/nuevo" className="rounded-xl px-3 py-1.5 hover:bg-white/10">+ Subir producto</Link>
        <Link href="/admin/pedidos" className="rounded-xl px-3 py-1.5 hover:bg-white/10">Pedidos</Link>
        <Link href="/admin/mudanzas" className="rounded-xl px-3 py-1.5 hover:bg-white/10">🚚 Agenda mudanzas</Link>
        <Link href="/admin/equipo" className="rounded-xl px-3 py-1.5 hover:bg-white/10">👥 Equipo</Link>
      </nav>
      {children}
    </div>
  );
}
