import Link from "next/link";
import { Icon } from "@/components/Icon";
import { formatCLP } from "@/lib/format";
import { VEHICLE_KINDS } from "@/lib/delivery";
import { createAdminClient } from "@/lib/supabase/admin";
import { presetFleet, rankVehicles } from "@/lib/shipping-pricing";
import { geocode, travelMatrix } from "@/lib/routing/geo";
import { depotPoint, getDeliverySettings, getVehicles } from "@/lib/routing/planner";
import { NodeIndex, loadLogistics } from "@/lib/routing/warehouses";

/** Volumen aproximado de cada servicio de mudanza (m³). */
const SERVICE_M3: Record<string, number> = { flete: 2.5, "depto-chico": 15, "casa-mediana": 25, "casa-grande": 40, oficina: 20 };

type Booking = {
  service_slug: string;
  day: string;
  slot_time: string;
  origin_address: string;
  origin_comuna: string;
  dest_address: string;
  dest_comuna: string;
};

/**
 * Qué vehículo conviene para una mudanza: sale de su parking, carga en el origen,
 * descarga en el destino y vuelve a su parking. Si no cabe en un viaje, cuenta los viajes.
 * Elige el que puede llevarlo con menor gasto (bencina, peajes y equipo).
 */
export async function VehicleSuggestion(props: { booking: Booking; estHours: number }) {
  try {
    return await suggestion(props);
  } catch (e) {
    console.error("[mudanzas] vehículo sugerido", e);
    return null;
  }
}

async function suggestion({ booking, estHours }: { booking: Booking; estHours: number }) {
  const db = createAdminClient();
  const settings = await getDeliverySettings(db);
  let fleet = await getVehicles(db, true, null).catch(() => []);
  const presets = fleet.length === 0;
  if (presets) fleet = presetFleet();
  const lg = await loadLogistics(db, null, await depotPoint(db, settings, null), settings, presets ? [] : fleet);

  const [origin, dest] = [
    await geocode(`${booking.origin_address}, ${booking.origin_comuna}`, booking.origin_comuna),
    await geocode(`${booking.dest_address}, ${booking.dest_comuna}`, booking.dest_comuna),
  ];
  const idx = new NodeIndex();
  idx.add("o", origin);
  idx.add("d", dest);
  const park = new Map(fleet.map((v) => [v.id, idx.add(lg.parkingOf(v).key, lg.parkingOf(v))]));
  const [h, m] = booking.slot_time.split(":").map(Number);
  const dep = (h || 9) * 3600 + (m || 0) * 60;
  const mx = await travelMatrix(idx.points, null, dep);
  const f = mx.source === "estimado" ? mx.factor(dep) : 1;
  const km = (i: number, j: number) => mx.dist[i][j] / 1000;
  const min = (i: number, j: number) => (mx.dur[i][j] * f) / 60;

  const m3 = SERVICE_M3[booking.service_slug] ?? 15;
  const load = { m3, kg: m3 * 120, rank: 3, serviceMin: 0 };
  const options = rankVehicles(fleet, load, (v) => {
    const p = park.get(v.id) ?? 0;
    return { kmOut: km(0, 1), kmBack: km(1, 0), minOut: min(0, 1), minBack: min(1, 0), kmToStart: km(p, 0), minToStart: min(p, 0), kmHome: km(1, p), minHome: min(1, p) };
  }, estHours * 60).options.slice(0, 3);
  if (!options.length) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-black"><Icon name="truck" className="h-5 w-5" /> Vehículo sugerido</h2>
        <p className="text-sm text-muted">
          Unos {m3} m³ para este servicio. Recorrido: parking → origen → destino → parking ({km(0, 1).toFixed(1)} km entre origen y destino
          {mx.source === "google" ? ", con tráfico de Google" : mx.roads === "osm" ? ", por calles reales" : ", estimado"}).
          {presets ? " Con vehículos de referencia: agrega los tuyos en " : " Gastos de cada vehículo en "}
          <Link href="/admin/despacho/ajustes" className="font-bold underline">Vehículos y horarios</Link>.
        </p>
      </div>
      <ul className="space-y-2">
        {options.map((o, i) => (
          <li key={o.vehicle.id} className={`rounded-xl border-2 p-3 ${i === 0 ? "border-foreground bg-surface" : "border-border"}`}>
            <div className="flex items-start justify-between gap-3">
              <p className="flex flex-wrap items-center gap-2 font-extrabold">
                {o.vehicle.name}
                <span className="text-xs font-bold text-muted">{VEHICLE_KINDS[o.vehicle.kind]?.label}</span>
                {i === 0 && <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-black text-background">Sugerido</span>}
              </p>
              <p className="text-right">
                <span className="block font-black">{formatCLP(Math.round(o.cost))}</span>
                <span className="text-xs text-muted">gasto estimado</span>
              </p>
            </div>
            <p className="mt-1 text-xs text-muted">
              {presets ? "" : `Sale de ${lg.parkingOf(o.vehicle).name} · `}
              {o.trips > 1 ? `${o.trips} viajes · ` : ""}
              {o.km.toFixed(1)} km · {o.hours.toFixed(1)} h · bencina {formatCLP(Math.round(o.fuel))} · peajes {formatCLP(Math.round(o.tolls))} · equipo {formatCLP(Math.round(o.crew))}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
