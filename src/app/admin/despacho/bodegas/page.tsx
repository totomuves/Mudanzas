import type { Metadata } from "next";
import { hasSupabaseEnv } from "@/lib/env";
import { requireSection } from "@/lib/admin";
import { SetupNotice } from "@/components/SetupNotice";
import { createAdminClient } from "@/lib/supabase/admin";
import { readWarehouses } from "@/lib/routing/warehouses";
import { DespachoTabs } from "../Tabs";
import { WarehouseForm, WarehouseItem } from "./WarehouseForms";
import { deleteWarehouse, saveWarehouse } from "./actions";

export const metadata: Metadata = { title: "Bodegas" };

export default async function BodegasPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireSection("despacho");
  const db = createAdminClient();
  const { warehouses, migrated } = await readWarehouses(db, false);

  if (!migrated) {
    return (
      <div className="space-y-6">
        <DespachoTabs active="/admin/despacho/bodegas" />
        <p className="rounded-2xl bg-brand-soft p-4 text-sm font-bold">
          Faltan las tablas de bodegas. En Supabase, abre SQL Editor y corre el archivo 20261118140000_bodegas_parking.sql.
        </p>
      </div>
    );
  }

  // Cuántos productos y vehículos hay en cada bodega
  const [{ data: prods }, { data: vehs }] = await Promise.all([
    db.from("products").select("warehouse_id").is("seller_id", null).neq("status", "sold"),
    db.from("vehicles").select("parking_warehouse_id, parking_address, name").is("seller_id", null),
  ]);
  const main = warehouses.find((w) => w.is_default) ?? warehouses[0];
  const products = new Map<string, number>();
  for (const p of prods ?? []) {
    const k = (p.warehouse_id as string | null) ?? main?.id ?? "";
    products.set(k, (products.get(k) ?? 0) + 1);
  }
  const parked = new Map<string, string[]>();
  for (const v of vehs ?? []) {
    const k = (v.parking_warehouse_id as string | null) ?? (v.parking_address ? "" : (main?.id ?? ""));
    if (k) parked.set(k, [...(parked.get(k) ?? []), v.name as string]);
  }

  return (
    <div className="space-y-6">
      <DespachoTabs active="/admin/despacho/bodegas" />
      <div className="space-y-1">
        <h1 className="text-2xl font-black">Bodegas</h1>
        <p className="text-muted">
          Dónde están guardados los productos de la tienda. Cada producto se asigna a una bodega al subirlo (si no, queda en la
          principal). Las rutas pasan a cargar a la bodega de cada producto, y el despacho se cobra una vez por bodega.
          Las direcciones solo las ve el equipo.
        </p>
      </div>
      {warehouses.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {warehouses.map((w) => (
            <WarehouseItem
              key={w.id}
              warehouse={w}
              products={products.get(w.id) ?? 0}
              vehicles={parked.get(w.id) ?? []}
              saveAction={saveWarehouse}
              deleteAction={deleteWarehouse}
            />
          ))}
        </ul>
      )}
      <details open={warehouses.length === 0} className="rounded-2xl border border-border bg-card p-4">
        <summary className="cursor-pointer font-extrabold">+ Agregar bodega</summary>
        <div className="pt-3"><WarehouseForm saveAction={saveWarehouse} /></div>
      </details>
    </div>
  );
}
