import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessRoute, requireDriver } from "./operations";

/**
 * UBICACIÓN EN VIVO DEL VEHÍCULO
 * Se guarda la última posición conocida en delivery_routes (last_lat, last_lng, last_seen_at).
 * Si falta la migración 20261116170000_ubicacion_vehiculo.sql, no hace nada.
 */

export type VehiclePosition = { routeId: string; lat: number; lng: number; seenAt: string; accuracy: number | null };

const valid = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0);

/** Guarda la posición solo si la ruta está en curso. */
export async function savePosition(routeId: string, here: { lat: number; lng: number; accuracy?: number | null } | null) {
  if (!here || !valid(here.lat, here.lng)) return;
  const { error } = await createAdminClient()
    .from("delivery_routes")
    .update({
      last_lat: here.lat,
      last_lng: here.lng,
      last_accuracy_m: here.accuracy != null && Number.isFinite(here.accuracy) ? Math.round(here.accuracy) : null,
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", routeId)
    .eq("status", "en_curso");
  if (error && !/last_lat|column/i.test(error.message)) console.warn("[posición]", error.message);
}

/** Últimas posiciones de estas rutas (las que no tienen, se omiten). */
export async function readPositions(routeIds: string[]): Promise<VehiclePosition[]> {
  if (!routeIds.length) return [];
  const { data, error } = await createAdminClient()
    .from("delivery_routes")
    .select("id, last_lat, last_lng, last_accuracy_m, last_seen_at")
    .in("id", routeIds)
    .not("last_seen_at", "is", null);
  if (error) return [];
  return (data ?? []).map((r) => ({
    routeId: r.id as string,
    lat: Number(r.last_lat),
    lng: Number(r.last_lng),
    seenAt: r.last_seen_at as string,
    accuracy: r.last_accuracy_m == null ? null : Number(r.last_accuracy_m),
  }));
}

/** De estas rutas, las que la persona conectada puede ver u operar. */
export async function accessibleRoutes(ids: string[]) {
  const clean = ids.filter((s) => /^[0-9a-f-]{36}$/i.test(s));
  if (!clean.length) return [];
  const access = await requireDriver();
  const { data } = await createAdminClient().from("delivery_routes").select("id, driver_id, seller_id").in("id", clean);
  return (data ?? []).filter((r) => canAccessRoute(access, r)).map((r) => r.id as string);
}

/** Igual que savePosition, pero revisa antes que la persona tenga acceso a la ruta. */
export async function savePositionChecked(routeId: string, here: { lat: number; lng: number } | null) {
  if (!here) return;
  if ((await accessibleRoutes([routeId])).length) await savePosition(routeId, here);
}
