"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMUNAS } from "@/lib/comunas";
import { computeQuote, DISTANCES, type DistanceKey, type MovingSettings, type ServiceType } from "@/lib/moving";

export type BookingState = { error?: string };

export async function createBooking(_prev: BookingState, f: FormData): Promise<BookingState> {
  const str = (k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
  const int = (k: string, def: number) => {
    const n = parseInt(String(f.get(k) ?? ""), 10);
    return Number.isFinite(n) ? n : def;
  };
  const bool = (k: string) => f.get(k) === "true" || f.get(k) === "on";

  const input = {
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
    notes: str("notes", 1000),
    contact_name: str("contact_name", 100),
    contact_email: str("contact_email", 120).toLowerCase(),
    contact_phone: str("contact_phone", 30),
  };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day) || !input.slot_time) return { error: "Elige día y hora." };
  if (input.origin_address.length < 4 || input.dest_address.length < 4) return { error: "Completa las direcciones." };
  const validComuna = (c: string) => COMUNAS.includes(c) || c === "Otra";
  if (!validComuna(input.origin_comuna) || !validComuna(input.dest_comuna)) return { error: "Elige las comunas." };
  if (!DISTANCES.some((d) => d.key === input.distance)) return { error: "Elige la distancia." };
  if (input.contact_name.length < 2) return { error: "Escribe tu nombre." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contact_email)) return { error: "Revisa tu correo." };
  if (input.contact_phone.replace(/\D/g, "").length < 8) return { error: "Escribe un teléfono de contacto." };

  const supabase = await createClient();
  const [{ data: service }, { data: settings }] = await Promise.all([
    supabase.from("service_types").select("*").eq("slug", input.service_slug).eq("active", true).maybeSingle(),
    supabase.from("moving_settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  if (!service || !settings) return { error: "Elige un tipo de servicio." };

  // El precio se recalcula en el servidor (no se confía en el navegador)
  const { total } = computeQuote(
    {
      service: service as ServiceType,
      distance: input.distance,
      originFloor: input.origin_floor,
      originElevator: input.origin_elevator,
      destFloor: input.dest_floor,
      destElevator: input.dest_elevator,
      packing: input.packing,
      heavyItems: input.heavy_items,
      day: input.day,
    },
    settings as MovingSettings,
  );

  let {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const { data } = await supabase.auth.signInAnonymously();
    user = data.user;
  }

  const { data: id, error } = await createAdminClient().rpc("create_booking", {
    p: { ...input, user_id: user?.id ?? "", estimated_price: total },
  });
  if (error) {
    console.error("[booking]", error);
    return { error: "No pudimos guardar tu reserva. Intenta de nuevo." };
  }
  if (!id) return { error: "¡Se acaba de ocupar ese horario! Elige otro, por favor." };

  redirect(`/mudanzas/reserva/${id}`);
}
