"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { TEAM_STATUS } from "@/lib/moving-leads";

export type FormState = { ok?: string; error?: string };

const UUID = /^[0-9a-f-]{36}$/i;
const MISSING = "No se pudo guardar. ¿Corriste la migración 20261119120000_posibles_mudanzas.sql?";

/** Seguimiento del equipo: estado y nota de una persona. */
export async function saveLead(_prev: FormState, f: FormData): Promise<FormState> {
  await requireSection("mudanzas");
  const userId = String(f.get("user_id") ?? "");
  const status = String(f.get("team_status") ?? "");
  const note = String(f.get("team_note") ?? "").trim().slice(0, 500);
  if (!UUID.test(userId)) return { error: "Persona no válida." };
  if (!TEAM_STATUS.some((s) => s.key === status)) return { error: "Elige un estado." };

  const { error } = await createAdminClient()
    .from("moving_leads")
    .upsert(
      { user_id: userId, team_status: status, team_note: note || null, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) return { error: MISSING };
  revalidatePath("/admin/mudanzas/posibles");
  return { ok: "Guardado." };
}

function int(f: FormData, k: string, min: number, max: number, fallback: number) {
  const n = parseInt(String(f.get(k) ?? ""), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Ajustes: desde qué puntaje se pregunta, cada cuánto y la oferta del último paso. */
export async function saveLeadSettings(_prev: FormState, f: FormData): Promise<FormState> {
  await requireSection("mudanzas");
  const { error } = await createAdminClient()
    .from("moving_lead_settings")
    .upsert({
      id: 1,
      enabled: f.get("enabled") === "on",
      threshold: int(f, "threshold", 1, 100, 40),
      window_days: int(f, "window_days", 3, 180, 30),
      ask_again_no_days: int(f, "ask_again_no_days", 7, 730, 120),
      ask_again_later_days: int(f, "ask_again_later_days", 1, 180, 10),
      reminder_offer: String(f.get("reminder_offer") ?? "").trim().slice(0, 200),
      updated_at: new Date().toISOString(),
    });
  if (error) return { error: MISSING };
  revalidatePath("/admin/mudanzas/posibles");
  return { ok: "Ajustes guardados." };
}
