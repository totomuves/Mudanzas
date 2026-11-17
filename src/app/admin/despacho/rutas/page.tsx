import type { Metadata } from "next";
import { hasSupabaseEnv } from "@/lib/env";
import { requireSection } from "@/lib/admin";
import { SetupNotice } from "@/components/SetupNotice";
import { RoutesBoard } from "@/components/reparto/RoutesBoard";
import { DespachoTabs } from "../Tabs";
import { assignDriver, deleteRoute, moveOrder, planDay, publishRoutes, reoptimize } from "./actions";

export const metadata: Metadata = { title: "Rutas del día" };
// Planificar puede tardar unos segundos (ubicar direcciones + optimizar)
export const maxDuration = 60;

export default async function RutasPage({ searchParams }: PageProps<"/admin/despacho/rutas">) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { supabase } = await requireSection("despacho");
  const sp = await searchParams;
  const { data } = await supabase.rpc("list_drivers");
  return (
    <RoutesBoard
      sellerId={null}
      fecha={typeof sp.fecha === "string" ? sp.fecha : undefined}
      tabs={<DespachoTabs active="/admin/despacho/rutas" />}
      actions={{ plan: planDay, publish: publishRoutes, assignDriver, reoptimize, moveOrder, deleteRoute }}
      drivers={(data ?? []) as { id: string; name: string }[]}
      setupHref="/admin/despacho/ajustes"
    />
  );
}
