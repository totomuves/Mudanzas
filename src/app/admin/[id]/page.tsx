import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/admin";
import { getCategories, getProduct } from "@/lib/data";
import { SetupNotice } from "@/components/SetupNotice";
import { ProductForm } from "../ProductForm";

export const metadata: Metadata = { title: "Editar producto" };

export default async function EditarProductoPage({ params }: PageProps<"/admin/[id]">) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireAdmin();
  const { id } = await params;
  const [product, categories] = await Promise.all([getProduct(id), getCategories()]);
  if (!product) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Editar producto</h1>
      <ProductForm categories={categories} product={product} />
    </div>
  );
}
