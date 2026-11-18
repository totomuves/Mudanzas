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
import { deleteVehicle, saveDeliverySettings, saveVehicle } from "./actions";

export const metadata: Metadata = { title: "Vehículos y horarios" };

export default async function AjustesRepartoPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { supabase } = await requireSection("despacho");
  const db = createAdminClient();
  const [s, v, d, w] = await Promise.all([
    readDeliverySettings(db, null),
    db.from("vehicles").select("*").is("seller_id", null).order("created_at"),
    supabase.rpc("list_drivers"),
    readWarehouses(db, true),
  ]);

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
      driversHint={drivers.length === 0 ? (
        <p className="text-sm text-muted">
          Para asignar choferes, crea en Admin → Equipo un rol con la sección <b>Reparto (chofer)</b> e invita a cada chofer con su correo.
        </p>
      ) : null}
    />
  );
}
