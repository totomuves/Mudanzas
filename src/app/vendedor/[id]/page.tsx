import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSeller } from "@/lib/seller";
import { getCategories, getProduct } from "@/lib/data";
import { aiFeatures } from "@/lib/admin-api";
import { ProductForm } from "../../admin/ProductForm";

export const metadata: Metadata = { title: "Editar producto" };

export default async function VendedorEditarPage({ params }: PageProps<"/vendedor/[id]">) {
  const { seller } = await requireSeller();
  const { id } = await params;
  const [product, categories] = await Promise.all([getProduct(id), getCategories()]);
  if (!product || product.seller_id !== seller.id) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Editar producto</h1>
      <ProductForm categories={categories} product={product} ai={aiFeatures()} sellerId={seller.id} basePath="/vendedor" />
    </div>
  );
}
