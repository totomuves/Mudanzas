"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export type CookieSwitchState = { ok?: string; error?: string };

/** Enciende o apaga el aviso de cookies (Ley 21.719). */
export async function setCookieConsentRequired(_prev: CookieSwitchState, formData: FormData): Promise<CookieSwitchState> {
  await requireSection("portada");
  const on = formData.get("enabled") === "1";
  const { error } = await createAdminClient()
    .from("site_settings")
    .upsert({ id: 1, cookie_consent_required: on, updated_at: new Date().toISOString() });
  if (error) return { error: "No se pudo cambiar. ¿Corriste la migración 20261116150000_aviso_cookies.sql?" };
  revalidatePath("/", "layout");
  return {
    ok: on
      ? "Aviso encendido: Google, Meta y TikTok miden solo a quien acepta."
      : "Aviso apagado: Google, Meta y TikTok miden a todos los visitantes.",
  };
}
