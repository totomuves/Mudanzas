"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, MIN_PASSWORD } from "@/lib/auth-errors";

const input = "w-full rounded-xl border border-border bg-card px-4 py-3";

export function PasswordForm({ next }: { next: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) return setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
    if (password !== repeat) return setError("Las dos contraseñas no coinciden.");
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(authErrorMessage(error));
    setDone(true);
    setTimeout(() => {
      router.replace(next);
      router.refresh();
    }, 1500);
  }

  if (done) {
    return <p className="rounded-xl bg-accent/15 p-4 font-bold text-accent">Contraseña guardada. Desde ahora puedes entrar con tu correo y esta contraseña.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-bold">Contraseña nueva</span>
        <input id="new-password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
        <span className="text-xs text-muted">Mínimo {MIN_PASSWORD} caracteres.</span>
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-bold">Repite la contraseña</span>
        <input id="repeat-password" type="password" required autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} className={input} />
      </label>
      {error && <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{error}</p>}
      <button disabled={busy} className="w-full rounded-full bg-brand py-3 font-extrabold text-white disabled:opacity-60">
        {busy ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}
