/** Traduce los errores de Supabase Auth a mensajes claros en español. */
export function authErrorMessage(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return null;
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  if (code === "invalid_credentials" || msg.includes("invalid login credentials"))
    return "Correo o contraseña incorrectos. Si siempre entraste con enlace al correo, usa “¿Olvidaste tu contraseña?” para crear una.";
  if (code === "email_not_confirmed" || msg.includes("email not confirmed"))
    return "Falta confirmar tu correo. Abre el enlace que te enviamos al crear la cuenta.";
  if (code === "user_already_exists" || msg.includes("already registered"))
    return "Ya existe una cuenta con ese correo. Ingresa o recupera tu contraseña.";
  if (code === "weak_password" || msg.includes("password should"))
    return "La contraseña es muy débil. Usa al menos 8 caracteres, mezclando letras y números.";
  if (code === "same_password" || msg.includes("different from the old"))
    return "La nueva contraseña debe ser distinta de la anterior.";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || msg.includes("rate limit"))
    return "Hiciste muchos intentos seguidos. Espera un minuto y vuelve a probar.";
  if (code === "validation_failed" || msg.includes("invalid email") || msg.includes("unable to validate email"))
    return "Revisa que el correo esté bien escrito.";
  if (code === "provider_disabled" || msg.includes("provider is not enabled"))
    return "Este método de ingreso todavía no está activado.";
  if (code === "signup_disabled") return "Por ahora no se pueden crear cuentas nuevas.";
  return "No pudimos completar la acción. Intenta de nuevo en un momento.";
}

/** Dirección del callback de Supabase, para volver a `next` después del correo o de Google. */
export function callbackUrl(next: string) {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

export const MIN_PASSWORD = 8;
