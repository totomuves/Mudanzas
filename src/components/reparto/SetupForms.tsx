"use client";

import { useActionState, useState } from "react";
import { Icon } from "@/components/Icon";
import {
  SIZES, SIZE_KEYS, VEHICLE_KINDS, VEHICLE_KEYS, WEEKDAYS, hhmm,
  type DeliverySettings, type ItemSize, type Vehicle, type VehicleKind,
} from "@/lib/delivery";
import type { FormState } from "@/lib/routing/manage";

type FormAction = (prev: FormState, f: FormData) => Promise<FormState>;
export type SetupActions = { saveSettings: FormAction; saveVehicle: FormAction; deleteVehicle: (f: FormData) => Promise<void> };

export type Driver = { id: string; email: string; name: string };
/** Opciones de parking: bodegas de MUVEO (para vendedores, [] = su bodega). null = falta la migración. */
export type ParkingOptions = { id: string; name: string }[] | null;

const input = "w-full rounded-xl border border-border bg-background px-3 py-2";

function Msg({ state }: { state: FormState }) {
  if (state.error) return <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{state.error}</p>;
  if (state.ok) return <p className="rounded-xl bg-accent/10 p-3 text-sm font-bold text-accent">{state.ok}</p>;
  return null;
}

export function SettingsForm({ settings: s, saveAction }: { settings: DeliverySettings; saveAction: FormAction }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAction, {});
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <fieldset className="space-y-2">
        <legend className="font-bold">Días de despacho</legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <label key={d} className="cursor-pointer">
              <input type="checkbox" name="days" value={d} defaultChecked={s.days.includes(d)} className="peer sr-only" />
              <span className="block rounded-full border-2 border-border px-4 py-2 text-sm font-bold peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background">
                {WEEKDAYS[d]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1">
          <span className="block text-sm font-bold">Hora de corte (día anterior)</span>
          <select name="cutoff_hour" defaultValue={s.cutoff_hour} className={input}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-sm font-bold">Salida de bodega</span>
          <input type="time" name="start_time" defaultValue={hhmm(s.start_time)} className={input} />
        </label>
        <label className="space-y-1">
          <span className="block text-sm font-bold">Cambio mañana / tarde</span>
          <input type="time" name="midday_time" defaultValue={hhmm(s.midday_time)} className={input} />
        </label>
        <label className="space-y-1">
          <span className="block text-sm font-bold">Última entrega</span>
          <input type="time" name="end_time" defaultValue={hhmm(s.end_time)} className={input} />
        </label>
        <label className="space-y-1">
          <span className="block text-sm font-bold">Minutos por entrega</span>
          <input name="service_minutes" inputMode="numeric" defaultValue={s.service_minutes} className={input} />
          <span className="block text-xs text-muted">Estacionar, bajar y firmar. Los productos grandes suman más solos.</span>
        </label>
        <label className="space-y-1">
          <span className="block text-sm font-bold">Ventana avisada al comprador</span>
          <select name="window_minutes" defaultValue={s.window_minutes} className={input}>
            {[60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m >= 120 ? `${m / 60} horas` : `${m} minutos`}</option>)}
          </select>
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="block text-sm font-bold">Dirección de la bodega (punto de salida)</span>
          <input name="depot_address" defaultValue={s.depot_address ?? ""} placeholder="Av. Ejemplo 1234, Quilicura" className={input} />
          <span className="block text-xs text-muted">
            {s.depot_lat != null ? `Ubicada en el mapa (${s.depot_lat.toFixed(4)}, ${s.depot_lng?.toFixed(4)}).` : "Sin ubicar todavía: se usa el centro de Santiago."}
          </span>
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="balance_routes" defaultChecked={s.balance_routes} className="mt-1" />
        <span>
          <b>Repartir el trabajo parejo entre los vehículos.</b> Apagado (recomendado): usa la menor cantidad de vehículos y
          kilómetros. Encendido: todos salen y terminan más temprano.
        </span>
      </label>
      <Msg state={state} />
      <button disabled={pending} className="rounded-full bg-foreground px-6 py-3 font-extrabold text-background disabled:opacity-60">
        {pending ? "Guardando…" : "Guardar horarios"}
      </button>
    </form>
  );
}

function ParkingField({ vehicle, options }: { vehicle?: Vehicle; options: { id: string; name: string }[] }) {
  const initial = vehicle?.parking_warehouse_id ?? (vehicle?.parking_address ? "direccion" : "");
  const [mode, setMode] = useState(initial);
  return (
    <div className="space-y-2 rounded-xl bg-surface p-3">
      <p className="text-sm font-bold">Dónde se estaciona (parking)</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <select name="parking_mode" value={mode} onChange={(e) => setMode(e.target.value)} className={input} aria-label="Parking">
          <option value="">{options.length ? `En la bodega principal (${options[0]?.name})` : "En la bodega"}</option>
          {options.slice(1).map((o) => <option key={o.id} value={o.id}>En {o.name}</option>)}
          <option value="direccion">En otra dirección…</option>
        </select>
        {mode === "direccion" && (
          <input name="parking_address" defaultValue={vehicle?.parking_address ?? ""} placeholder="Calle 123, Ñuñoa" className={input} aria-label="Dirección del parking" />
        )}
      </div>
      <p className="text-xs text-muted">
        Cada ruta sale de aquí, pasa a cargar a la bodega, entrega o retira y vuelve aquí. Si se estaciona en una bodega,
        ese tramo no suma kilómetros. El costo del despacho incluye la ida desde el parking y la vuelta.
      </p>
    </div>
  );
}

export function VehicleForm({ vehicle, drivers, saveAction, onDone, parking = null }: { vehicle?: Vehicle; drivers: Driver[]; saveAction: FormAction; onDone?: () => void; parking?: ParkingOptions }) {
  const [state, action, pending] = useActionState<FormState, FormData>(async (p, f) => {
    const r = await saveAction(p, f);
    if (r.ok) onDone?.();
    return r;
  }, {});
  const [kind, setKind] = useState<VehicleKind>(vehicle?.kind ?? "camion");
  const preset = VEHICLE_KINDS[kind];
  const [m3, setM3] = useState(String(vehicle?.capacity_m3 ?? preset.m3));
  const [kg, setKg] = useState(String(vehicle?.capacity_kg ?? preset.kg));
  const [maxSize, setMaxSize] = useState<ItemSize>(vehicle?.max_item_size ?? preset.maxSize);
  const [cost, setCost] = useState(String(vehicle?.cost_per_km ?? preset.costPerKm));
  const [crew, setCrew] = useState(String(vehicle?.crew ?? preset.crew));
  const [hourly, setHourly] = useState(String(vehicle?.hourly_cost || preset.hourlyCost));
  const [dims, setDims] = useState({ l: "", a: "", h: "" });

  function pickKind(k: VehicleKind) {
    setKind(k);
    const p = VEHICLE_KINDS[k];
    setM3(String(p.m3));
    setKg(String(p.kg));
    setMaxSize(p.maxSize);
    setCost(String(p.costPerKm));
    setCrew(String(p.crew));
    setHourly(String(p.hourlyCost));
  }
  function calc(next: typeof dims) {
    setDims(next);
    const [l, a, h] = [next.l, next.a, next.h].map((x) => parseFloat(x.replace(",", ".")));
    if (l > 0 && a > 0 && h > 0) setM3(String(Math.round(l * a * h * 100) / 100));
  }

  return (
    <form action={action} className="space-y-4">
      {vehicle && <input type="hidden" name="id" value={vehicle.id} />}
      <input type="hidden" name="kind" value={kind} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {VEHICLE_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => pickKind(k)}
            className={`rounded-2xl border-2 p-3 text-left ${kind === k ? "border-foreground bg-surface" : "border-border"}`}
          >
            <Icon name={k === "auto" ? "route" : "truck"} className="mb-1 h-6 w-6" />
            <span className="block font-bold">{VEHICLE_KINDS[k].label}</span>
            <span className="text-xs text-muted">~{VEHICLE_KINDS[k].m3} m³ · {VEHICLE_KINDS[k].kg} kg</span>
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="block text-sm font-bold">Nombre</span>
          <input name="name" defaultValue={vehicle?.name ?? ""} placeholder={`${preset.label} 1`} required className={input} />
        </label>
        <label className="space-y-1">
          <span className="block text-sm font-bold">Patente (opcional)</span>
          <input name="plate" defaultValue={vehicle?.plate ?? ""} placeholder="ABCD12" className={input} />
        </label>
      </div>
      <div className="space-y-2 rounded-xl bg-surface p-3">
        <p className="text-sm font-bold">Espacio de carga</p>
        <div className="grid grid-cols-3 gap-2">
          {(["l", "a", "h"] as const).map((k) => (
            <label key={k} className="space-y-1">
              <span className="block text-xs text-muted">{k === "l" ? "Largo (m)" : k === "a" ? "Ancho (m)" : "Alto (m)"}</span>
              <input value={dims[k]} onChange={(e) => calc({ ...dims, [k]: e.target.value })} inputMode="decimal" placeholder="—" className={input} />
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="block text-xs font-bold">Capacidad (m³)</span>
            <input name="capacity_m3" value={m3} onChange={(e) => setM3(e.target.value)} inputMode="decimal" className={input} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-bold">Peso máximo (kg)</span>
            <input name="capacity_kg" value={kg} onChange={(e) => setKg(e.target.value)} inputMode="numeric" className={input} />
          </label>
        </div>
        <p className="text-xs text-muted">Si mides el espacio de carga, el sistema calcula los m³ solo. Usamos el 100%: si quieres un margen, pon un poco menos.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="block text-sm font-bold">Producto más grande que lleva</span>
          <select name="max_item_size" value={maxSize} onChange={(e) => setMaxSize(e.target.value as ItemSize)} className={input}>
            {SIZE_KEYS.map((k) => <option key={k} value={k}>{SIZES[k].label}: {SIZES[k].hint}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-sm font-bold">Personas a bordo</span>
          <select name="crew" value={crew} onChange={(e) => setCrew(e.target.value)} className={input}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <div className="space-y-2 rounded-xl bg-surface p-3">
        <p className="text-sm font-bold">Gasto del vehículo</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="block text-xs font-bold">Bencina y desgaste por km (CLP)</span>
            <input name="cost_per_km" value={cost} onChange={(e) => setCost(e.target.value)} inputMode="numeric" className={input} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-bold">Peajes por viaje, ida y vuelta (CLP)</span>
            <input name="toll_per_trip" defaultValue={vehicle?.toll_per_trip ?? 0} inputMode="numeric" className={input} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-bold">Chofer y ayudantes por hora (CLP)</span>
            <input name="hourly_cost" value={hourly} onChange={(e) => setHourly(e.target.value)} inputMode="numeric" className={input} />
          </label>
        </div>
        <p className="text-xs text-muted">
          Con esto se calcula el costo de cada despacho y se elige el vehículo más barato que pueda llevar la carga.
          Ejemplo de bencina: si rinde 8 km por litro y el litro está a $1.300, son $163 por km (súmale algo por desgaste).
        </p>
      </div>
      {parking && <ParkingField vehicle={vehicle} options={parking} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="block text-sm font-bold">Chofer habitual</span>
          <select name="driver_id" defaultValue={vehicle?.driver_id ?? ""} className={input}>
            <option value="">Sin asignar</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.email})</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-bold">
          <input type="checkbox" name="active" defaultChecked={vehicle?.active ?? true} /> Disponible para repartir
        </label>
      </div>
      <Msg state={state} />
      <button disabled={pending} className="rounded-full bg-foreground px-6 py-3 font-extrabold text-background disabled:opacity-60">
        {pending ? "Guardando…" : vehicle ? "Guardar cambios" : "Agregar vehículo"}
      </button>
    </form>
  );
}

export function VehicleItem({ vehicle: v, drivers, actions, parking = null }: { vehicle: Vehicle; drivers: Driver[]; actions: SetupActions; parking?: ParkingOptions }) {
  const [editing, setEditing] = useState(false);
  const driver = drivers.find((d) => d.id === v.driver_id);
  const parkedAt = parking
    ? v.parking_address
      ? v.parking_address
      : (parking.find((o) => o.id === v.parking_warehouse_id) ?? parking[0])?.name ?? "la bodega"
    : null;
  if (editing) {
    return (
      <li className="rounded-2xl border border-border bg-card p-4 sm:col-span-2">
        <VehicleForm vehicle={v} drivers={drivers} saveAction={actions.saveVehicle} onDone={() => setEditing(false)} parking={parking} />
        <button onClick={() => setEditing(false)} className="mt-2 text-sm font-bold text-muted">Cancelar</button>
      </li>
    );
  }
  return (
    <li className={`flex items-start gap-3 rounded-2xl border border-border bg-card p-4 ${v.active ? "" : "opacity-60"}`}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface">
        <Icon name="truck" className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-extrabold">{v.name} {v.plate && <span className="text-sm font-bold text-muted">· {v.plate}</span>}</p>
        <p className="text-sm">{VEHICLE_KINDS[v.kind]?.label} · {Number(v.capacity_m3)} m³ · {v.capacity_kg} kg</p>
        <p className="text-xs text-muted">
          Hasta {SIZES[v.max_item_size]?.label.toLowerCase()} · {v.crew} {v.crew === 1 ? "persona" : "personas"} · ${v.cost_per_km}/km{v.toll_per_trip ? ` · peajes $${v.toll_per_trip}` : ""}{v.hourly_cost ? ` · $${v.hourly_cost}/h` : ""}
        </p>
        <p className="text-xs text-muted">{driver ? `Chofer: ${driver.name}` : "Sin chofer asignado"}{v.active ? "" : " · Pausado"}</p>
        {parkedAt && <p className="text-xs text-muted">Parking: {parkedAt}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <button onClick={() => setEditing(true)} className="rounded-full border border-border px-3 py-1 text-xs font-bold">Editar</button>
        <form action={actions.deleteVehicle}>
          <input type="hidden" name="id" value={v.id} />
          <button className="rounded-full px-3 py-1 text-xs font-bold text-pass">Borrar</button>
        </form>
      </div>
    </li>
  );
}
