import type { Metadata } from "next";
import { hasSupabaseEnv } from "@/lib/env";
import { requireSection } from "@/lib/admin";
import { SetupNotice } from "@/components/SetupNotice";
import type { Vehicle } from "@/lib/delivery";
import { readDeliverySettings, getDeliverySettings } from "@/lib/routing/planner";
import { readWarehouses } from "@/lib/routing/warehouses";
import { createAdminClient } from "@/lib/supabase/admin";
import { SetupBoard } from "@/components/reparto/SetupBoard";
import type { Driver } from "@/components/reparto/SetupForms";
import { DespachoTabs } from "../Tabs";
import { DriversPanel } from "./DriversPanel";
import { deleteVehicle, saveDeliverySettings, saveVehicle } from "./actions";

export const metadata: Metadata = { title: "Vehículos y horarios" };

export default async function AjustesRepartoPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { supabase, owner } = await requireSection("despacho");
  const db = createAdminClient();
  const [s, v, d, w] = await Promise.all([
    readDeliverySettings(db, null),
    db.from("vehicles").select("*").is("seller_id", null).order("created_at"),
    supabase.rpc("list_drivers"),
    readWarehouses(db, true),
  ]);
  // Choferes invitados que todavía no entran a la app (solo lo ve un administrador total)
  let invited: string[] = [];
  if (owner) {
    const [team, roles] = await Promise.all([supabase.rpc("list_team"), supabase.rpc("list_admin_roles")]);
    const reparto = new Set(((roles.data ?? []) as { id: string; sections: string[] }[]).filter((r) => r.sections.includes("reparto")).map((r) => r.id));
    invited = ((team.data ?? []) as { email: string; is_owner: boolean; role_id: string | null; status: string }[])
      .filter((m) => m.status === "invitado" && (m.is_owner || (m.role_id && reparto.has(m.role_id))))
      .map((m) => m.email);
  }

  if (s.error || v.error) {
    return (
      <div className="space-y-6">
        <DespachoTabs active="/admin/despacho/ajustes" />
        <p className="rounded-2xl bg-brand-soft p-4 text-sm font-bold">
          Faltan las tablas de reparto. En Supabase, abre SQL Editor y corre los archivos
          20261116100000_rutas_despacho.sql y 20261116110000_reparto_vendedores.sql.
        </p>
      </div>
    );
  }
  const drivers = (d.data ?? []) as Driver[];

  return (
    <SetupBoard
      tabs={<DespachoTabs active="/admin/despacho/ajustes" />}
      settings={s.settings ?? (await getDeliverySettings(db))}
      vehicles={(v.data ?? []) as Vehicle[]}
      drivers={drivers}
      parking={w.migrated ? w.warehouses.map((x) => ({ id: x.id, name: x.name })) : null}
      actions={{ saveSettings: saveDeliverySettings, saveVehicle, deleteVehicle }}
      driversHint={<DriversPanel drivers={drivers} invited={invited} canInvite={owner} />}
    />
  );
}
