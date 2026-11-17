import type { Metadata } from "next";
import { hasSupabaseEnv } from "@/lib/env";
import { getShippingConfig } from "@/lib/data";
import { SetupNotice } from "@/components/SetupNotice";
import { CartScreen } from "./CartScreen";

export const metadata: Metadata = { title: "Carrito" };

export default async function CarritoPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const shipping = await getShippingConfig();
  return <CartScreen shipping={shipping} />;
}
