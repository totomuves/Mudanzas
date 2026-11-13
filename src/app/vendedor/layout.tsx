import Link from "next/link";
import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { getMySeller, SELLER_STATUS_LABEL } from "@/lib/seller";
import { SetupNotice } from "@/components/SetupNotice";
import { Icon } from "@/components/Icon";

/** Panel del vendedor: aquí sí se ve su marca (nombre y logo), nunca en la tienda pública. */
export default async function VendedorLayout({ children }: LayoutProps<"/vendedor">) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { user, seller } = await getMySeller();
  if (!user) redirect("/ingresar?next=/vendedor");
  if (!seller) redirect("/vender");

  const approved = seller.status === "approved";
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface">
          {seller.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={seller.logo_url} alt="" className="h-full w-full object-contain" />
          ) : (
            <Icon name="store" className="h-6 w-6" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-black">{seller.name}</p>
          <p className="text-xs font-semibold text-muted">Panel de vendedor · {SELLER_STATUS_LABEL[seller.status]}</p>
        </div>
      </div>
      {approved && (
        <nav className="scroll-row -mx-4 flex gap-2 overflow-x-auto px-4 text-sm font-bold md:mx-0 md:flex-wrap md:px-0">
          <Link href="/vendedor" className="shrink-0 rounded-full bg-surface px-4 py-2 hover:bg-border">Mis productos</Link>
          <Link href="/vendedor/nuevo" className="shrink-0 rounded-full bg-brand px-4 py-2 text-white">+ Subir producto</Link>
          <Link href="/vendedor/pedidos" className="shrink-0 rounded-full bg-surface px-4 py-2 hover:bg-border">Ventas y pagos</Link>
          <Link href="/vendedor/tienda" className="shrink-0 rounded-full bg-surface px-4 py-2 hover:bg-border">Mis datos</Link>
        </nav>
      )}
      {children}
    </div>
  );
}
