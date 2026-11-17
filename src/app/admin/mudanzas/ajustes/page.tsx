import type { Metadata } from "next";
import { hasSupabaseEnv } from "@/lib/env";
import { requireSection } from "@/lib/admin";
import { SetupNotice } from "@/components/SetupNotice";
import type { MovingSettings } from "@/lib/moving";
import { MudanzasTabs } from "../Tabs";
import { SettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Horarios y recargos de mudanzas" };

export default async function MudanzasAjustesPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { supabase } = await requireSection("mudanzas");
  const { data } = await supabase.from("moving_settings").select("*").eq("id", 1).maybeSingle();

  return (
    <div className="space-y-6">
      <MudanzasTabs active="/admin/mudanzas/ajustes" />
      <div className="space-y-1">
        <h1 className="text-2xl font-black">Horarios y recargos</h1>
        <p className="text-muted">Lo que cambies aquí se aplica de inmediato en el cotizador y en la página de mudanzas.</p>
      </div>
      {data ? (
        <SettingsForm settings={data as MovingSettings} />
      ) : (
        <p className="rounded-2xl bg-brand-soft p-4 text-sm font-bold">
          No se encontró la configuración de mudanzas. Revisa que esté corrida la migración 20261113010000_servicio_mudanzas.sql.
        </p>
      )}
    </div>
  );
}
