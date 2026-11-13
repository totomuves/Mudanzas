import type { Metadata } from "next";
import { requireSeller } from "@/lib/seller";
import { getCategories } from "@/lib/data";
import { aiFeatures } from "@/lib/admin-api";
import { ProductForm } from "../../admin/ProductForm";

export const metadata: Metadata = { title: "Subir producto" };

export default async function VendedorNuevoPage() {
  const { seller } = await requireSeller();
  const categories = await getCategories();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Subir producto</h1>
      <ProductForm categories={categories} ai={aiFeatures()} sellerId={seller.id} basePath="/vendedor" />
    </div>
  );
}
