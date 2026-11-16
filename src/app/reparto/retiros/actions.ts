"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminAccess } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { planPickupRoute } from "@/lib/routing/planner";

export type PickupFormState = { error?: string; ok?: string; at?: number };
export type PickupPlanState = { error?: string; ok?: string; unassigned?: { orderId: string; title: string; reason: string }[] };

/** Retiros: quienes administran Despacho y los choferes (sección Reparto). */
async function requirePickups() {
  const access = await getAdminAccess();
  if (!access.user || access.user.is_anonymous) redirect("/ingresar?next=/reparto/retiros");
  if (!access.sections.includes("reparto") && !access.sections.includes("despacho")) redirect("/admin/sin-permiso");
  return access.user;
}

const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

function refresh() {
  revalidatePath("/reparto/retiros");
  revalidatePath("/admin/despacho/retiros");
  revalidatePath("/admin/despacho/rutas");
}

export async function savePickup(_prev: PickupFormState, f: FormData): Promise<PickupFormState> {
  const user = await requirePickups();
  const str = (k: string) => String(f.get(k) ?? "").trim();
  const num = (k: string) => {
    const n = parseFloat(str(k).replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const date = str("pickup_date");
  const slot = ["manana", "tarde"].includes(str("slot")) ? str("slot") : "cualquiera";
  const size = ["chico", "mediano", "grande", "muy_grande"].includes(str("size")) ? str("size") : null;
  const row = {
    pickup_date: date,
    slot,
    contact_name: str("contact_name").slice(0, 80),
    contact_phone: str("contact_phone").slice(0, 30) || null,
    address: str("address").slice(0, 200),
    comuna: str("comuna") || null,
    address_notes: str("address_notes").slice(0, 200) || null,
    items: str("items").slice(0, 300),
    size,
    volume_m3: num("volume_m3"),
    weight_kg: num("weight_kg"),
  };
  if (!isDate(date)) return { error: "Elige el día del retiro." };
  if (row.contact_name.length < 2) return { error: "Escribe el nombre de quien regala." };
  if (row.address.length < 3) return { error: "Escribe la dirección." };
  if (row.items.length < 2) return { error: "Cuenta qué se retira (por ejemplo: sofá 3 cuerpos y 2 sillas)." };

  const db = createAdminClient();
  const { error } = await db.from("pickups").insert({ ...row, created_by: user.id });
  if (error) {
    console.error("[retiros]", error);
    return { error: error.message.includes("pickups") ? "Falta correr la migración de retiros en Supabase (20261116160000_retiros.sql)." : error.message };
  }
  refresh();
  return { ok: `Retiro agregado: ${row.contact_name}, ${row.address}.`, at: Date.now() };
}

/** Quita un retiro que aún no se hace (si va en una ruta que no ha salido, sale de ella). */
export async function cancelPickup(f: FormData) {
  await requirePickups();
  const id = String(f.get("id") ?? "");
  if (!isId(id)) return;
  const db = createAdminClient();
  const { data: stop } = await db.from("route_stops").select("id, status, delivery_routes(status)").eq("pickup_id", id).maybeSingle();
  const routeStatus = (stop?.delivery_routes as unknown as { status: string } | null)?.status;
  if (routeStatus === "en_curso" || routeStatus === "terminada") return;
  await db.from("route_stops").delete().eq("pickup_id", id);
  await db.from("pickups").update({ status: "cancelado" }).eq("id", id).neq("status", "retirado");
  refresh();
}

/** Cambia el retiro de día (sale de su ruta si aún no empieza). */
export async function movePickup(f: FormData) {
  await requirePickups();
  const id = String(f.get("id") ?? "");
  const to = String(f.get("to") ?? "");
  if (!isId(id) || !isDate(to)) return;
  const db = createAdminClient();
  const { data: stop } = await db.from("route_stops").select("id, delivery_routes(status)").eq("pickup_id", id).maybeSingle();
  const routeStatus = (stop?.delivery_routes as unknown as { status: string } | null)?.status;
  if (routeStatus === "en_curso" || routeStatus === "terminada") return;
  await db.from("route_stops").delete().eq("pickup_id", id);
  await db.from("pickups").update({ pickup_date: to, status: "pendiente" }).eq("id", id).neq("status", "retirado");
  refresh();
}

/** El chofer arma su ruta de retiros del día y sale directo a la vista de ruta. */
export async function planMyPickups(_prev: PickupPlanState, f: FormData): Promise<PickupPlanState> {
  const user = await requirePickups();
  const date = String(f.get("date") ?? "");
  const vehicleId = String(f.get("vehicle_id") ?? "");
  if (!isDate(date)) return { error: "Fecha inválida." };
  let routeId: string | undefined;
  try {
    const r = await planPickupRoute(date, user.id, isId(vehicleId) ? vehicleId : null);
    if (!r.routes) {
      return r.unassigned.length
        ? { error: "No se pudo armar la ruta.", unassigned: r.unassigned }
        : { ok: "No quedan retiros sin ruta para este día." };
    }
    routeId = r.routeId;
    refresh();
    if (r.unassigned.length) {
      return { ok: `Ruta lista con ${r.stops} retiros (${r.distanceKm} km). Algunos no cupieron:`, unassigned: r.unassigned };
    }
  } catch (e) {
    console.error("[retiros] ruta", e);
    return { error: e instanceof Error ? e.message : "No se pudo armar la ruta." };
  }
  if (routeId) redirect(`/reparto/${routeId}`);
  return {};
}

/** Aceptar una solicitud que llegó desde la web: queda con día y entra a las rutas. */
export async function acceptRequest(f: FormData) {
  const access = await getAdminAccess();
  if (!access.sections.includes("despacho")) return;
  const id = String(f.get("id") ?? "");
  const date = String(f.get("pickup_date") ?? "");
  if (!isId(id) || !isDate(date)) return;
  const size = String(f.get("size") ?? "");
  const m3 = parseFloat(String(f.get("volume_m3") ?? "").replace(",", "."));
  await createAdminClient()
    .from("pickups")
    .update({
      status: "pendiente",
      pickup_date: date,
      reviewed_at: new Date().toISOString(),
      ...(["chico", "mediano", "grande", "muy_grande"].includes(size) ? { size } : {}),
      ...(Number.isFinite(m3) && m3 > 0 ? { volume_m3: m3 } : {}),
    })
    .eq("id", id)
    .eq("status", "solicitado");
  refresh();
}

export async function rejectRequest(f: FormData) {
  const access = await getAdminAccess();
  if (!access.sections.includes("despacho")) return;
  const id = String(f.get("id") ?? "");
  if (!isId(id)) return;
  const note = String(f.get("note") ?? "").trim().slice(0, 300) || null;
  await createAdminClient()
    .from("pickups")
    .update({ status: "rechazado", reviewed_at: new Date().toISOString(), review_note: note })
    .eq("id", id)
    .eq("status", "solicitado");
  refresh();
}
