import type { Metadata } from "next";
import Link from "next/link";
import { requireSeller } from "@/lib/seller";
import { RoutesBoard } from "@/components/reparto/RoutesBoard";
import { DespachoTabs, SELLER_TABS } from "@/app/admin/despacho/Tabs";
import { sellerAssignDriver, sellerMoveOrder, sellerPlanDay, sellerPublish, sellerReoptimize } from "../reparto-actions";

export const metadata: Metadata = { title: "Reparto" };
export const maxDuration = 60;

export default async function VendedorRepartoPage({ searchParams }: PageProps<"/vendedor/reparto">) {
  const { seller, user } = await requireSeller();
  const sp = await searchParams;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Tus ventas con despacho las entregas tú. Planifica las rutas del día, avisa a tus compradores y registra cada
        entrega con foto y firma desde <Link href="/reparto" className="font-bold underline">tu vista de chofer</Link>.
      </p>
      <RoutesBoard
        sellerId={seller.id}
        fecha={typeof sp.fecha === "string" ? sp.fecha : undefined}
        tabs={<DespachoTabs active="/vendedor/reparto" tabs={SELLER_TABS} />}
        actions={{ plan: sellerPlanDay, publish: sellerPublish, assignDriver: sellerAssignDriver, reoptimize: sellerReoptimize, moveOrder: sellerMoveOrder }}
        drivers={[{ id: user.id, name: seller.contact_name || seller.name }]}
        setupHref="/vendedor/reparto/ajustes"
      />
    </div>
  );
}
