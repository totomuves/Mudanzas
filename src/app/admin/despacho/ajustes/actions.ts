"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/admin";
import { SIZE_KEYS, VEHICLE_KEYS, type ItemSize, type VehicleKind } from "@/lib/delivery";
import { geocode } from "@/lib/routing/geo";

export type FormState = { ok?: string; error?: string };

const time = (v: FormDataEntryValue | null, fallback: string) => {
  const s = String(v ?? "");
  return /^\d{2}:\d{2}$/.test(s) ? s : fallback;
};
const int = (v: FormDataEntryValue | null, min: number, max: number, fallback: number) => {
  const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const dec = (v: FormDataEntryValue | null) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export async function saveDeliverySettings(_prev: FormState, f: FormData): Promise<FormState> {
  const { supabase } = await requireSection("despacho");
  const days = f.getAll("days").map((d) => parseInt(String(d), 10)).filter((d) => d >= 1 && d <= 7);
  if (!days.length) return { error: "Elige al menos un día de despacho." };
  const start = time(f.get("start_time"), "09:00");
  const end = time(f.get("end_time"), "19:00");
  const mid = time(f.get("midday_time"), "14:00");
  if (!(start < mid && mid < end)) return { error: "Revisa los horarios: inicio < cambio de franja < término." };

  const address = String(f.get("depot_address") ?? "").trim().slice(0, 200);
  const { data: current } = await supabase.from("delivery_settings").select("depot_address, depot_lat, depot_lng").eq("id", 1).maybeSingle();
  let lat = current?.depot_lat ?? null, lng = current?.depot_lng ?? null;
  let note = "";
  if (address && address !== current?.depot_address) {
    const p = await geocode(address);
    lat = p.lat;
    lng = p.lng;
    if (p.source === "comuna") note = " No encontré la dirección exacta de la bodega: revisa que tenga número y comuna.";
  }
  if (!address) {
    lat = null;
    lng = null;
  }

  const { error } = await supabase.from("delivery_settings").upsert({
    id: 1,
    days: [...new Set(days)].sort(),
    cutoff_hour: int(f.get("cutoff_hour"), 0, 23, 18),
    start_time: start,
    end_time: end,
    midday_time: mid,
    service_minutes: int(f.get("service_minutes"), 1, 120, 12),
    window_minutes: int(f.get("window_minutes"), 30, 480, 120),
    depot_address: address || null,
    depot_lat: lat,
    depot_lng: lng,
    balance_routes: f.get("balance_routes") === "on",
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/despacho", "layout");
  return { ok: `Guardado.${note}` };
}

export async function saveVehicle(_prev: FormState, f: FormData): Promise<FormState> {
  const { supabase } = await requireSection("despacho");
  const id = String(f.get("id") ?? "");
  const kind = String(f.get("kind")) as VehicleKind;
  const maxSize = String(f.get("max_item_size")) as ItemSize;
  const name = String(f.get("name") ?? "").trim().slice(0, 60);
  const m3 = dec(f.get("capacity_m3"));
  const kg = int(f.get("capacity_kg"), 1, 50000, 0);
  if (name.length < 2) return { error: "Ponle un nombre (ej: Camión 1)." };
  if (!VEHICLE_KEYS.includes(kind)) return { error: "Elige el tipo de vehículo." };
  if (!SIZE_KEYS.includes(maxSize)) return { error: "Elige el tamaño máximo." };
  if (!(m3 > 0 && m3 <= 100)) return { error: "Revisa la capacidad en m³." };
  if (!kg) return { error: "Revisa la capacidad en kg." };
  const driver = String(f.get("driver_id") ?? "");
  const row = {
    name,
    plate: String(f.get("plate") ?? "").trim().toUpperCase().slice(0, 12) || null,
    kind,
    capacity_m3: Math.round(m3 * 100) / 100,
    capacity_kg: kg,
    max_item_size: maxSize,
    cost_per_km: int(f.get("cost_per_km"), 0, 10000, 250),
    crew: int(f.get("crew"), 1, 4, 1),
    driver_id: /^[0-9a-f-]{36}$/i.test(driver) ? driver : null,
    active: f.get("active") === "on",
  };
  const { error } = /^[0-9a-f-]{36}$/i.test(id)
    ? await supabase.from("vehicles").update(row).eq("id", id)
    : await supabase.from("vehicles").insert(row);
  if (error) return { error: error.message };
  revalidatePath("/admin/despacho/ajustes");
  return { ok: "Vehículo guardado." };
}

export async function deleteVehicle(f: FormData) {
  const { supabase } = await requireSection("despacho");
  const id = String(f.get("id") ?? "");
  if (/^[0-9a-f-]{36}$/i.test(id)) await supabase.from("vehicles").delete().eq("id", id);
  revalidatePath("/admin/despacho/ajustes");
}
