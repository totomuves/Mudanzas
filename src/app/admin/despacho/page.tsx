import type { Metadata } from "next";
import { hasSupabaseEnv } from "@/lib/env";
import { requireSection } from "@/lib/admin";
import { SetupNotice } from "@/components/SetupNotice";
import { COMUNAS } from "@/lib/comunas";
import type { ShippingRate } from "@/lib/types";
import { ShippingForm } from "./ShippingForm";

export const metadata: Metadata = { title: "Despacho" };

export default async function DespachoAdminPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { supabase } = await requireSection("despacho");
  const { data, error } = await supabase.from("shipping_rates").select("*");
  const rates = (data ?? []) as ShippingRate[];

  // Todas las comunas conocidas + las que se hayan agregado a mano
  const names = Array.from(new Set([...COMUNAS, ...rates.map((r) => r.comuna)])).sort((a, b) => a.localeCompare(b, "es"));
  const rows = names.map((comuna) => {
    const r = rates.find((x) => x.comuna === comuna);
    return { comuna, price: r ? r.price : null, active: r ? r.active : true };
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-black">Despacho por comuna</h1>
        <p className="text-muted">
          Escribe cuánto cobras por despachar a cada comuna. El precio se suma al total cuando el comprador elige
          despacho. Si dejas el precio vacío, esa comuna no aparece y solo se puede retirar. Usa 0 para despacho gratis.
        </p>
      </div>

      {error && (
        <p className="rounded-2xl bg-brand-soft p-4 text-sm font-bold">
          Falta crear la tabla de despacho. En Supabase, abre SQL Editor y corre el archivo
          supabase/migrations/20261114140000_despacho_comunas.sql.
        </p>
      )}

      <ShippingForm rows={rows} />
    </div>
  );
}
