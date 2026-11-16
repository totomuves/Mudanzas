import type { Metadata } from "next";
import { hasSupabaseEnv } from "@/lib/env";
import { requireSection } from "@/lib/admin";
import { SetupNotice } from "@/components/SetupNotice";
import { PickupsBoard } from "@/components/reparto/PickupsBoard";
import { DespachoTabs } from "../Tabs";

export const metadata: Metadata = { title: "Retiros" };
export const maxDuration = 60;

export default async function RetirosAdminPage({ searchParams }: PageProps<"/admin/despacho/retiros">) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireSection("despacho");
  const sp = await searchParams;
  return (
    <PickupsBoard
      fecha={typeof sp.fecha === "string" ? sp.fecha : undefined}
      tabs={<DespachoTabs active="/admin/despacho/retiros" />}
      driverMode
      canReview
    />
  );
}
