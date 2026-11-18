"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMUNAS } from "@/lib/comunas";
import { geocode } from "@/lib/routing/geo";
import type { FormState } from "@/lib/routing/manage";

const isId = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

function refresh() {
  revalidatePath("/admin/despacho", "layout");
  revalidatePath("/admin", "layout");
}

/** Crea o edita una bodega. Al cambiar la dirección se vuelve a ubicar en el mapa. */
export async function saveWarehouse(_prev: FormState, f: FormData): Promise<FormState> {
  await requireSection("despacho");
  const db = createAdminClient();
  const id = String(f.get("id") ?? "");
  const name = String(f.get("name") ?? "").trim().slice(0, 60);
  const address = String(f.get("address") ?? "").trim().slice(0, 200);
  const comunaRaw = String(f.get("comuna") ?? "");
  const comuna = COMUNAS.includes(comunaRaw) ? comunaRaw : null;
  if (name.length < 2) return { error: "Ponle un nombre (ej: Bodega Toto)." };

  let current: { address: string | null; comuna: string | null; lat: number | null; lng: number | null } | null = null;
  if (isId(id)) {
    const { data } = await db.from("warehouses").select("address, comuna, lat, lng").eq("id", id).maybeSingle();
    current = data;
  }
  let lat = current?.lat ?? null, lng = current?.lng ?? null;
  let note = "";
  if (address && (address !== current?.address || comuna !== current?.comuna || lat == null)) {
    const p = await geocode(comuna && !address.includes(comuna) ? `${address}, ${comuna}` : address, comuna);
    lat = p.lat;
    lng = p.lng;
    if (p.source === "comuna") note = " No encontré la dirección exacta: revisa que tenga número y comuna (por ahora uso el centro de la comuna).";
  }
  if (!address) {
    lat = null;
    lng = null;
  }
  const row = {
    name,
    address: address || null,
    comuna,
    lat,
    lng,
    notes: String(f.get("notes") ?? "").trim().slice(0, 300) || null,
    active: f.get("active") === "on",
  };
  const makeDefault = f.get("is_default") === "on";
  const res = isId(id)
    ? await db.from("warehouses").update(row).eq("id", id).select("id").single()
    : await db.from("warehouses").insert(row).select("id").single();
  if (res.error || !res.data) {
    console.error("[bodegas]", res.error);
    return { error: "No pudimos guardar. ¿Ya corriste la migración 20261118140000_bodegas_parking.sql?" };
  }
  if (makeDefault) {
    await db.from("warehouses").update({ is_default: false }).neq("id", res.data.id).eq("is_default", true);
    await db.from("warehouses").update({ is_default: true, active: true }).eq("id", res.data.id);
  }
  refresh();
  return { ok: `Bodega guardada.${note}` };
}

/** Borra una bodega: sus productos pasan a la principal y los vehículos que dormían ahí quedan en la principal. */
export async function deleteWarehouse(f: FormData) {
  await requireSection("despacho");
  const id = String(f.get("id") ?? "");
  if (!isId(id)) return;
  const db = createAdminClient();
  const { data: w } = await db.from("warehouses").select("is_default").eq("id", id).maybeSingle();
  if (!w || w.is_default) return; // la principal no se borra (primero marca otra como principal)
  await db.from("warehouses").delete().eq("id", id);
  refresh();
}
