"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, callbackUrl, MIN_PASSWORD } from "@/lib/auth-errors";
import { Icon } from "@/components/Icon";

type Mode = "password" | "signup" | "magic";

const input = "w-full rounded-xl border border-border bg-card px-4 py-3";

/** Ingreso con contraseña, cuenta nueva, enlace mágico o Google. */
export function LoginForm({ next, google }: { next: string; google: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<null | "magic" | "confirm">(null);

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    try {
      if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callbackUrl(next) } });
        if (error) return setError(authErrorMessage(error));
        setSent("magic");
      } else if (mode === "signup") {
        if (password.length < MIN_PASSWORD) return setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callbackUrl(next) } });
        if (error) return setError(authErrorMessage(error));
        // Supabase no avisa si el correo ya existía: en ese caso devuelve un usuario sin identidades
        if (data.user && data.user.identities?.length === 0) {
          return setError("Ya existe una cuenta con ese correo. Ingresa o recupera tu contraseña.");
        }
        if (data.session) {
          router.replace(next);
          router.refresh();
        } else {
          setSent("confirm");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return setError(authErrorMessage(error));
        router.replace(next);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function withGoogle() {
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl(next) },
    });
    if (error) {
      setError(authErrorMessage(error));
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-3 rounded-card bg-surface p-5">
        <p className="flex items-center gap-2 font-extrabold">
          <Icon name="mail" className="h-5 w-5" strokeWidth={2.2} />
          Revisa tu correo
        </p>
        <p className="text-sm text-muted">
          {sent === "magic"
            ? `Te enviamos un enlace a ${email}. Ábrelo en este mismo teléfono o computador para entrar.`
            : `Te enviamos un enlace a ${email} para confirmar tu cuenta. Después de abrirlo quedas dentro.`}
        </p>
        <button type="button" onClick={() => setSent(null)} className="text-sm font-bold underline underline-offset-4">
          Usar otro correo
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {google && (
        <>
          <button
            type="button"
            onClick={withGoogle}
            disabled={busy}
            className="flex w-full items-center justify-center gap-3 rounded-full border border-foreground py-3 font-bold transition hover:bg-surface disabled:opacity-60"
          >
            <GoogleLogo />
            Continuar con Google
          </button>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" />o con tu correo<span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      {mode !== "magic" && (
        <div className="grid grid-cols-2 rounded-full bg-surface p-1 text-sm font-bold" role="tablist">
          {(["password", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={`rounded-full py-2 transition ${mode === m ? "bg-background shadow-sm" : "text-muted"}`}
            >
              {m === "password" ? "Ingresar" : "Crear cuenta"}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-bold">Correo</span>
          <input id="login-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.cl" className={input} />
        </label>
        {mode !== "magic" && (
          <label className="block space-y-1">
            <span className="flex items-baseline justify-between text-sm font-bold">
              Contraseña
              {mode === "password" && (
                <Link href={`/recuperar?next=${encodeURIComponent(next)}`} className="text-xs font-semibold text-muted underline underline-offset-4">
                  ¿Olvidaste tu contraseña?
                </Link>
              )}
            </span>
            <input
              id="login-password"
              type="password"
              required
              minLength={mode === "signup" ? MIN_PASSWORD : undefined}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
            />
            {mode === "signup" && <span className="text-xs text-muted">Mínimo {MIN_PASSWORD} caracteres.</span>}
          </label>
        )}
        {error && <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{error}</p>}
        <button disabled={busy} className="w-full rounded-full bg-brand py-3 font-extrabold text-white disabled:opacity-60">
          {busy ? "Un momento…" : mode === "password" ? "Ingresar" : mode === "signup" ? "Crear cuenta" : "Enviarme el enlace"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => switchMode(mode === "magic" ? "password" : "magic")}
        className="w-full text-center text-sm font-semibold text-muted underline underline-offset-4"
      >
        {mode === "magic" ? "Prefiero usar contraseña" : "Prefiero recibir un enlace en mi correo, sin contraseña"}
      </button>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.4 5.7c4.3-4 6.9-9.9 6.9-17.2z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.9-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
