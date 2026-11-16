import "server-only";
import { cache } from "react";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * ¿Está encendido el aviso de cookies? (Admin → Portada).
 * Apagado o sin la migración 20261116150000_aviso_cookies.sql: se mide a todos sin aviso.
 */
export const getCookieConsentRequired = cache(async () => {
  if (!hasSupabaseEnv()) return false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("site_settings").select("cookie_consent_required").eq("id", 1).maybeSingle();
    return !error && data?.cookie_consent_required === true;
  } catch {
    return false;
  }
});
