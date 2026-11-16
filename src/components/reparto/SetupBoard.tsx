import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import type { DeliverySettings, Vehicle } from "@/lib/delivery";
import { hasGoogleMaps } from "@/lib/routing/geo";
import { SettingsForm, VehicleForm, VehicleItem, type Driver, type SetupActions } from "./SetupForms";

/** Vehículos y horarios de despacho (admin de MUVEO y panel del vendedor). */
export function SetupBoard({
  tabs,
  settings,
  vehicles,
  drivers,
  actions,
  driversHint,
  showTraffic = true,
}: {
  tabs?: ReactNode;
  settings: DeliverySettings;
  vehicles: Vehicle[];
  drivers: Driver[];
  actions: SetupActions;
  driversHint?: ReactNode;
  showTraffic?: boolean;
}) {
  return (
    <div className="space-y-8">
      {tabs}

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
            {vehicles.map((x) => <VehicleItem key={x.id} vehicle={x} drivers={drivers} actions={actions} />)}
          </ul>
        )}
        <details open={vehicles.length === 0} className="rounded-2xl border border-border bg-card p-4">
          <summary className="cursor-pointer font-extrabold">+ Agregar vehículo</summary>
          <div className="pt-3"><VehicleForm drivers={drivers} saveAction={actions.saveVehicle} /></div>
        </details>
        {driversHint}
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-2xl font-black">Días y horarios de despacho</h2>
          <p className="text-muted">
            Los pedidos se juntan hasta la hora de corte del día anterior. El comprador ve la fecha de entrega al pagar y
            elige si lo quiere en la mañana o en la tarde.
          </p>
        </div>
        <SettingsForm settings={settings} saveAction={actions.saveSettings} />
      </section>

      {showTraffic && (
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
      )}
    </div>
  );
}
