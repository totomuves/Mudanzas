import type { Metadata } from "next";
import { hasSupabaseEnv } from "@/lib/env";
import { requireSection } from "@/lib/admin";
import { SetupNotice } from "@/components/SetupNotice";
import { DEFAULT_DELIVERY_SETTINGS, type DeliverySettings, type Vehicle } from "@/lib/delivery";
import { hasGoogleMaps } from "@/lib/routing/geo";
import { DespachoTabs } from "../Tabs";
import { SettingsForm, VehicleForm, VehicleItem, type Driver } from "./Forms";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = { title: "Vehículos y horarios" };

export default async function AjustesRepartoPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { supabase } = await requireSection("despacho");
  const [s, v, d] = await Promise.all([
    supabase.from("delivery_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("vehicles").select("*").order("created_at"),
    supabase.rpc("list_drivers"),
  ]);

  if (s.error || v.error) {
    return (
      <div className="space-y-6">
        <DespachoTabs active="/admin/despacho/ajustes" />
        <p className="rounded-2xl bg-brand-soft p-4 text-sm font-bold">
          Falta crear las tablas de reparto. En Supabase, abre SQL Editor y corre el archivo
          supabase/migrations/20261116100000_rutas_despacho.sql.
        </p>
      </div>
    );
  }

  const settings = { ...DEFAULT_DELIVERY_SETTINGS, ...((s.data ?? {}) as Partial<DeliverySettings>) };
  const vehicles = (v.data ?? []) as Vehicle[];
  const drivers = (d.data ?? []) as Driver[];

  return (
    <div className="space-y-8">
      <DespachoTabs active="/admin/despacho/ajustes" />

      <section className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-black">Vehículos</h1>
          <p className="text-muted">
            Agrega cada vehículo con su espacio de carga en metros cúbicos (largo × ancho × alto) y el peso que aguanta.
            Al planificar, el sistema elige qué vehículo lleva cada pedido: los productos chicos van en el más económico
            y los muy grandes solo en los que tienen espacio y 2 personas.
          </p>
        </div>
        {vehicles.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {vehicles.map((x) => <VehicleItem key={x.id} vehicle={x} drivers={drivers} />)}
          </ul>
        )}
        <details open={vehicles.length === 0} className="rounded-2xl border border-border bg-card p-4">
          <summary className="cursor-pointer font-extrabold">+ Agregar vehículo</summary>
          <div className="pt-3"><VehicleForm drivers={drivers} /></div>
        </details>
        {drivers.length === 0 && (
          <p className="text-sm text-muted">
            Para asignar choferes, crea en Admin → Equipo un rol con la sección <b>Reparto (chofer)</b> e invita a cada chofer con su correo.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-2xl font-black">Días y horarios de despacho</h2>
          <p className="text-muted">
            Los pedidos se juntan hasta la hora de corte del día anterior. El comprador ve la fecha de entrega al pagar y
            elige si lo quiere en la mañana o en la tarde.
          </p>
        </div>
        <SettingsForm settings={settings} />
      </section>

      <section className="flex gap-3 rounded-2xl border border-border bg-card p-4 text-sm">
        <Icon name="navigation" className="mt-0.5 h-5 w-5 text-brand" />
        <div className="space-y-1">
          <p className="font-extrabold">Tráfico real: {hasGoogleMaps() ? "activo (Google Maps)" : "estimado"}</p>
          <p className="text-muted">
            {hasGoogleMaps()
              ? "Las rutas usan los tiempos de viaje de Google con el tráfico previsto para el día y la hora."
              : "Sin clave de Google Maps, los tiempos se calculan por distancia y las horas punta de Santiago, y las direcciones se ubican con OpenStreetMap. Para usar el tráfico real, agrega GOOGLE_MAPS_API_KEY en Vercel (Routes API y Geocoding API activadas)."}
          </p>
        </div>
      </section>
    </div>
  );
}
