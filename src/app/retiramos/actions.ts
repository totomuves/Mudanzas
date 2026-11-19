"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
import { COMUNAS } from "@/lib/comunas";

export type RequestState = { error?: string; ok?: boolean };

const MAX_PHOTO = 1.5 * 1024 * 1024;

/**
 * Alguien pide que pasemos a buscar algo que ya no usa. Llega como
 * "solicitud" con fotos; el equipo la acepta (le pone día) o la rechaza.
 */
export async function requestPickup(_prev: RequestState, f: FormData): Promise<RequestState> {
  // Trampa para bots: campo oculto que una persona nunca llena
  if (String(f.get("website") ?? "")) return { ok: true };
  const str = (k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);
  const name = str("name", 80);
  const phone = str("phone", 30);
  const email = str("email", 120).toLowerCase();
  const address = str("address", 200);
  const comuna = str("comuna", 60);
  const notes = str("address_notes", 200);
  const items = str("items", 300);
  const slot = ["manana", "tarde"].includes(str("slot", 20)) ? str("slot", 20) : "cualquiera";
  const photos = f.getAll("photos").filter((x): x is File => x instanceof File && x.size > 0).slice(0, 4);

  if (name.length < 2) return { error: "Escribe tu nombre." };
  if (phone.replace(/\D/g, "").length < 8) return { error: "Escribe un teléfono para coordinar." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Revisa tu correo." };
  if (!(COMUNAS as readonly string[]).includes(comuna)) return { error: "Elige tu comuna." };
  if (address.length < 5) return { error: "Escribe la dirección." };
  if (items.length < 3) return { error: "Cuéntanos qué quieres que retiremos." };
  if (f.get("good_condition") !== "on") return { error: "Solo retiramos cosas en buen estado y funcionando. Confírmalo para seguir." };
  if (!photos.length) return { error: "Sube al menos una foto para saber si podemos llevarlo." };
  if (photos.some((p) => p.size > MAX_PHOTO || !p.type.startsWith("image/"))) return { error: "Una de las fotos es muy pesada. Prueba con otra." };

  const db = createAdminClient();
  // Freno simple: máximo 3 solicitudes por teléfono al día
  const digits = phone.replace(/\D/g, "").slice(-8);
  const { count } = await db
    .from("pickups")
    .select("id", { count: "exact", head: true })
    .eq("source", "web")
    .ilike("contact_phone", `%${digits.slice(-4)}%`)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if ((count ?? 0) >= 3) return { error: "Ya recibimos tus solicitudes de hoy. Te escribiremos pronto." };

  const id = crypto.randomUUID();
  const paths: string[] = [];
  for (const [i, p] of photos.entries()) {
    const path = `retiros/solicitudes/${id}/foto-${i + 1}.jpg`;
    const up = await db.storage.from("entregas").upload(path, p, { contentType: p.type || "image/jpeg", upsert: true });
    if (up.error) {
      console.error("[retiramos] foto", up.error);
      return { error: "No pudimos subir las fotos. Intenta de nuevo." };
    }
    paths.push(path);
  }

  const { error } = await db.from("pickups").insert({
    id,
    pickup_date: null,
    status: "solicitado",
    source: "web",
    slot,
    contact_name: name,
    contact_phone: phone,
    contact_email: email || null,
    address,
    comuna,
    address_notes: notes || null,
    items,
    request_photos: paths,
  });
  if (error) {
    console.error("[retiramos]", error);
    return { error: "No pudimos enviar tu solicitud. Intenta en unos minutos." };
  }
  // Para "posibles mudanzas": pedir un retiro suma puntos (si falta la migración, no pasa nada)
  const { user } = await getUser();
  if (user) {
    await db
      .from("moving_signals")
      .upsert({ user_id: user.id, kind: "solicitud_retiro" }, { onConflict: "user_id,kind,day", ignoreDuplicates: true })
      .then(({ error: e }) => e && console.warn("[retiramos] señal", e.message));
  }
  return { ok: true };
}
