import type { Metadata } from "next";
import { hasSupabaseEnv } from "@/lib/env";
import { requireSection } from "@/lib/admin";
import { SetupNotice } from "@/components/SetupNotice";
import type { ServiceType } from "@/lib/moving";
import { MudanzasTabs } from "../Tabs";
import { ServiceForm } from "./ServiceForm";
import { ServiceItem } from "./ServiceItem";

export const metadata: Metadata = { title: "Servicios y precios de mudanzas" };

export default async function MudanzasServiciosPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { supabase } = await requireSection("mudanzas");
  const { data } = await supabase.from("service_types").select("*").order("sort_order").order("slug");
  const services = (data ?? []) as ServiceType[];

  return (
    <div className="space-y-6">
      <MudanzasTabs active="/admin/mudanzas/servicios" />
      <div className="space-y-1">
        <h1 className="text-2xl font-black">Servicios y precios</h1>
        <p className="text-muted">
          Son las tarjetas de “Precios” de la página de mudanzas y las opciones del cotizador. Para que un servicio deje de
          aparecer, desmarca “Visible” (no se borra, así las mudanzas antiguas siguen mostrando su servicio).
        </p>
      </div>

      <ul className="space-y-3">
        {services.map((s, i) => (
          <ServiceItem key={s.slug} service={s} first={i === 0} last={i === services.length - 1} />
        ))}
      </ul>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-6">
        <h2 className="text-lg font-black">Nuevo servicio</h2>
        <ServiceForm key={services.length} />
      </section>
    </div>
  );
}
