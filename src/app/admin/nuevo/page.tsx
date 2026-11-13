import type { Metadata } from "next";
import { hasSupabaseEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/admin";
import { getCategories } from "@/lib/data";
import { SetupNotice } from "@/components/SetupNotice";
import { ProductForm } from "../ProductForm";

export const metadata: Metadata = { title: "Subir producto" };

export default async function NuevoProductoPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireAdmin();
  const categories = await getCategories();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Subir producto</h1>
      <ProductForm categories={categories} />
    </div>
  );
}
