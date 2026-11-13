import type { Metadata } from "next";
import { requireSeller } from "@/lib/seller";
import { SellerForm } from "../../vender/SellerForm";

export const metadata: Metadata = { title: "Mis datos" };

export default async function VendedorTiendaPage() {
  const { seller } = await requireSeller();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-black">Mis datos</h1>
      <SellerForm seller={seller} />
    </div>
  );
}
