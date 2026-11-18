import type { Metadata } from "next";
import { hasSupabaseEnv } from "@/lib/env";
import { requireSection } from "@/lib/admin";
import { getCategories } from "@/lib/data";
import { SetupNotice } from "@/components/SetupNotice";
import { ProductForm } from "../ProductForm";
import { aiFeatures } from "@/lib/admin-api";
import { getWarehouses } from "@/lib/routing/warehouses";

export const metadata: Metadata = { title: "Subir producto" };

export default async function NuevoProductoPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireSection("productos");
  const [categories, warehouses] = await Promise.all([getCategories(), getWarehouses(undefined, true)]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Subir producto</h1>
      <ProductForm categories={categories} ai={aiFeatures()} warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))} />
    </div>
  );
}
