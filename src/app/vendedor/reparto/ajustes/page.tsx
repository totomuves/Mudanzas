import type { Metadata } from "next";
import { requireSeller } from "@/lib/seller";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDeliverySettings } from "@/lib/routing/planner";
import type { Vehicle } from "@/lib/delivery";
import { SetupBoard } from "@/components/reparto/SetupBoard";
import { DespachoTabs, SELLER_TABS } from "@/app/admin/despacho/Tabs";
import { sellerDeleteVehicle, sellerSaveSettings, sellerSaveVehicle } from "../../reparto-actions";

export const metadata: Metadata = { title: "Vehículos y horarios" };

export default async function VendedorRepartoAjustesPage() {
  const { seller, user } = await requireSeller();
  const db = createAdminClient();
  const [settings, { data, error }] = await Promise.all([
    getDeliverySettings(db, seller.id),
    db.from("vehicles").select("*").eq("seller_id", seller.id).order("created_at"),
  ]);
  if (error) {
    return <p className="rounded-2xl bg-brand-soft p-4 text-sm font-bold">El reparto todavía no está disponible. Avísale al equipo de MUVEO.</p>;
  }
  return (
    <SetupBoard
      tabs={<DespachoTabs active="/vendedor/reparto/ajustes" tabs={SELLER_TABS} />}
      settings={settings}
      vehicles={(data ?? []) as Vehicle[]}
      drivers={[{ id: user.id, name: seller.contact_name || seller.name, email: user.email ?? "" }]}
      actions={{ saveSettings: sellerSaveSettings, saveVehicle: sellerSaveVehicle, deleteVehicle: sellerDeleteVehicle }}
      showTraffic={false}
      driversHint={
        <p className="text-sm text-muted">
          Al guardar los días de despacho, tus compradores verán la fecha de entrega al pagar. Mientras no configures
          vehículos, tus ventas con despacho se coordinan como siempre.
        </p>
      }
    />
  );
}
