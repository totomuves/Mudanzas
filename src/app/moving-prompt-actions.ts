"use server";

import { getUser } from "@/lib/supabase/server";
import { MOVE_WHEN, signalForPath, type PromptState } from "@/lib/moving-leads";

/**
 * Acciones del aviso "¿Te cambias de casa?". Si la migración
 * 20261119120000_posibles_mudanzas.sql no está corrida, no hacen nada.
 */

/** Suma la visita a una página de mudanzas o retiros (una vez por día). */
export async function logMovingVisit(pathname: string) {
  const kind = signalForPath(pathname);
  if (!kind) return;
  const { supabase, user } = await getUser();
  if (!user) return;
  await supabase.rpc("log_moving_signal", { p_kind: kind });
}

/** Qué mostrarle ahora: la pregunta, un paso, o nada. */
export async function getMovingPrompt(): Promise<PromptState> {
  const { supabase, user } = await getUser();
  if (!user) return { show: null };
  const { data, error } = await supabase.rpc("moving_prompt_state");
  if (error || !data) return { show: null };
  return data as PromptState;
}

export async function answerMovingPrompt(input: {
  answer: "si" | "no" | "despues" | "cerrar";
  when?: string;
  contactOk?: boolean;
  name?: string;
  phone?: string;
}): Promise<PromptState> {
  const { supabase, user } = await getUser();
  if (!user) return { show: null };
  const when = MOVE_WHEN.some((w) => w.key === input.when) ? input.when : null;
  const phone = String(input.phone ?? "").replace(/[^\d+ ]/g, "").slice(0, 30);
  const contactOk = Boolean(input.contactOk) && phone.replace(/\D/g, "").length >= 8;
  const { error } = await supabase.rpc("moving_prompt_answer", {
    p_answer: input.answer,
    p_when: when,
    p_contact_ok: contactOk,
    p_name: String(input.name ?? "").trim().slice(0, 80) || null,
    p_phone: contactOk ? phone : null,
  });
  if (error || input.answer !== "si") return { show: null };
  return getMovingPrompt();
}

/** Cierra el paso de hoy, o deja de mostrar pasos ("No quiero más consejos"). */
export async function closeMovingStep(stop: boolean) {
  const { supabase, user } = await getUser();
  if (!user) return;
  await supabase.rpc("moving_step_close", { p_stop: stop });
}
