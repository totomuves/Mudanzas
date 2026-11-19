import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { requireSection } from "@/lib/admin";
import { getCategories, getProduct } from "@/lib/data";
import { SetupNotice } from "@/components/SetupNotice";
import { ProductForm } from "../ProductForm";
import { aiFeatures } from "@/lib/admin-api";
import { getWarehouses } from "@/lib/routing/warehouses";

export const metadata: Metadata = { title: "Editar producto" };

export default async function EditarProductoPage({ params }: PageProps<"/admin/[id]">) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireSection("productos");
  const { id } = await params;
  const [product, categories, warehouses] = await Promise.all([getProduct(id), getCategories(), getWarehouses()]);
  if (!product) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Editar producto</h1>
      <ProductForm
        categories={categories}
        product={product}
        ai={aiFeatures()}
        warehouses={product.seller_id ? [] : warehouses.filter((w) => w.active || w.id === (product as { warehouse_id?: string | null }).warehouse_id).map((w) => ({ id: w.id, name: w.name }))}
      />
    </div>
  );
}
