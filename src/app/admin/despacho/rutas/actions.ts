"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { nextDeliveryDateAfter, planDeliveryDay, publishDay, reoptimizeRoute } from "@/lib/routing/planner";

export type PlanState = { ok?: string; error?: string; unassigned?: { orderId: string; title: string; reason: string }[] };

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isId = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const PATH = "/admin/despacho/rutas";

export async function planDay(_prev: PlanState, f: FormData): Promise<PlanState> {
  await requireSection("despacho");
  const date = String(f.get("date") ?? "");
  if (!isDate(date)) return { error: "Fecha inválida." };
  try {
    const r = await planDeliveryDay(date);
    revalidatePath(PATH);
    if (!r.routes && !r.unassigned.length) return { ok: "No hay pedidos pendientes para este día." };
    const fuente = r.source === "google" ? "con tráfico real de Google" : "con tráfico estimado";
    return {
      ok: `Listo: ${r.stops} entregas en ${r.routes} ${r.routes === 1 ? "ruta" : "rutas"}, ${r.distanceKm} km en total (${fuente}; ${r.iterations.toLocaleString("es-CL")} combinaciones probadas en ${(r.ms / 1000).toFixed(1)} s).`,
      unassigned: r.unassigned,
    };
  } catch (e) {
    console.error("[rutas] planificar", e);
    return { error: e instanceof Error ? e.message : "No se pudo planificar." };
  }
}

export async function publishRoutes(f: FormData) {
  await requireSection("despacho");
  const date = String(f.get("date") ?? "");
  if (isDate(date)) await publishDay(date);
  revalidatePath(PATH);
}

export async function assignDriver(f: FormData) {
  const { supabase } = await requireSection("despacho");
  const id = String(f.get("routeId") ?? "");
  const driver = String(f.get("driver_id") ?? "");
  if (!isId(id)) return;
  await supabase.from("delivery_routes").update({ driver_id: isId(driver) ? driver : null }).eq("id", id);
  revalidatePath(PATH);
}

export async function reoptimize(f: FormData) {
  await requireSection("despacho");
  const id = String(f.get("routeId") ?? "");
  if (isId(id)) await reoptimizeRoute(id, null);
  revalidatePath(PATH);
}

/** Mueve un pedido a otra fecha de despacho (o a la siguiente disponible). */
export async function moveOrder(f: FormData) {
  await requireSection("despacho");
  const orderId = String(f.get("orderId") ?? "");
  const from = String(f.get("from") ?? "");
  let to = String(f.get("to") ?? "");
  if (!isId(orderId)) return;
  if (!isDate(to)) to = (isDate(from) ? await nextDeliveryDateAfter(from) : null) ?? "";
  if (!isDate(to)) return;
  const db = createAdminClient();
  await db.from("route_stops").delete().eq("order_id", orderId).neq("status", "entregado");
  await db.from("orders").update({ delivery_date: to }).eq("id", orderId).is("delivered_at", null);
  revalidatePath(PATH);
}
