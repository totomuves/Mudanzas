import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { SetupNotice } from "@/components/SetupNotice";
import { Icon } from "@/components/Icon";
import { getAdminAccess } from "@/lib/admin";
import { PickupsBoard } from "@/components/reparto/PickupsBoard";

export const metadata: Metadata = { title: "Retiros" };
// Armar la ruta puede tardar unos segundos (ubicar direcciones + optimizar)
export const maxDuration = 60;

export default async function RetirosChoferPage({ searchParams }: PageProps<"/reparto/retiros">) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const access = await getAdminAccess();
  if (!access.user || access.user.is_anonymous) redirect("/ingresar?next=/reparto/retiros");
  if (!access.sections.includes("reparto") && !access.sections.includes("despacho")) redirect("/admin/sin-permiso");
  const sp = await searchParams;
  return (
    <div className="space-y-4">
      <Link href="/reparto" className="inline-flex items-center gap-1 text-sm font-bold text-muted"><Icon name="back" className="h-4 w-4" />Mis rutas</Link>
      <PickupsBoard fecha={typeof sp.fecha === "string" ? sp.fecha : undefined} driverMode canReview={access.sections.includes("despacho")} />
    </div>
  );
}
