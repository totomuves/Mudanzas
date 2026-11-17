"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/admin";
import { DISTANCES, type DistanceKey } from "@/lib/moving";

export type AdminBookingState = { error?: string };

const STATUSES = ["requested", "confirmed", "completed", "cancelled"];
const FALTA_MIGRACION =
  "Para crear mudanzas desde el admin falta correr la migración 20261117110000_admin_mudanzas.sql en Supabase.";

/** Crea (sin id) o edita (con id) una mudanza desde el admin. No revisa cupos: el equipo decide. */
export async function saveAdminBooking(_prev: AdminBookingState, f: FormData): Promise<AdminBookingState> {
  const { supabase, user } = await requireSection("mudanzas");
  const str = (k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
  const int = (k: string, def: number) => {
    const n = parseInt(String(f.get(k) ?? "").replace(/[^\d-]/g, ""), 10);
    return Number.isFinite(n) ? n : def;
  };
  const bool = (k: string) => f.get(k) === "on" || f.get(k) === "true";

  const id = str("id", 40);
  const row = {
    service_slug: str("service_slug", 40),
    day: str("day", 10),
    slot_time: str("slot_time", 5),
    origin_address: str("origin_address"),
    origin_comuna: str("origin_comuna", 60),
    origin_floor: Math.min(40, Math.max(1, int("origin_floor", 1))),
    origin_elevator: bool("origin_elevator"),
    dest_address: str("dest_address"),
    dest_comuna: str("dest_comuna", 60),
    dest_floor: Math.min(40, Math.max(1, int("dest_floor", 1))),
    dest_elevator: bool("dest_elevator"),
    distance: str("distance", 20) as DistanceKey,
    packing: bool("packing"),
    heavy_items: Math.min(10, Math.max(0, int("heavy_items", 0))),
    notes: str("notes", 1000) || null,
    contact_name: str("contact_name", 100),
    contact_email: str("contact_email", 120).toLowerCase() || null,
    contact_phone: str("contact_phone", 30),
    estimated_price: Math.max(0, int("estimated_price", -1)),
    status: str("status", 20),
  };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.day)) return { error: "Elige el día." };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.slot_time)) return { error: "Elige la hora." };
  if (!row.service_slug) return { error: "Elige el servicio." };
  if (row.origin_address.length < 3 || row.dest_address.length < 3) return { error: "Completa las direcciones." };
  if (row.origin_comuna.length < 2 || row.dest_comuna.length < 2) return { error: "Completa las comunas." };
  if (!DISTANCES.some((d) => d.key === row.distance)) return { error: "Elige la distancia." };
  if (row.contact_name.length < 2) return { error: "Escribe el nombre del cliente." };
  if (row.contact_phone.replace(/\D/g, "").length < 8) return { error: "Escribe un teléfono de contacto." };
  if (row.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.contact_email)) return { error: "Revisa el correo (o déjalo vacío)." };
  if (!STATUSES.includes(row.status)) return { error: "Elige el estado." };
  if (int("estimated_price", -1) < 0) return { error: "Escribe el precio." };

  if (id) {
    const { error } = await supabase.from("bookings").update(row).eq("id", id);
    if (error) {
      console.error("[admin booking update]", error);
      return { error: error.code === "23502" ? FALTA_MIGRACION : "No se pudo guardar. Intenta de nuevo." };
    }
  } else {
    const { error } = await supabase.from("bookings").insert({ ...row, source: "admin", created_by: user.id });
    if (error) {
      console.error("[admin booking insert]", error);
      const missing = ["42501", "42703", "PGRST204", "23502"].includes(error.code ?? "");
      return { error: missing ? FALTA_MIGRACION : "No se pudo crear la mudanza. Intenta de nuevo." };
    }
  }

  revalidatePath("/admin/mudanzas");
  revalidatePath("/mudanzas/cotizar");
  redirect(`/admin/mudanzas?ok=${id ? "editada" : "creada"}`);
}
