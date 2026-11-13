"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, callbackUrl } from "@/lib/auth-errors";
import { Icon } from "@/components/Icon";

export function RecoverForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl(`/cuenta/clave?next=${encodeURIComponent(next)}`),
    });
    setBusy(false);
    if (error) return setError(authErrorMessage(error));
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-2 rounded-card bg-surface p-5">
        <p className="flex items-center gap-2 font-extrabold">
          <Icon name="mail" className="h-5 w-5" strokeWidth={2.2} />
          Revisa tu correo
        </p>
        <p className="text-sm text-muted">
          Si {email} tiene cuenta, te llegará un enlace en un par de minutos. Ábrelo en este mismo teléfono o computador y
          elige tu contraseña nueva. Revisa también la carpeta de spam.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-bold">Correo</span>
        <input
          id="recover-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@correo.cl"
          className="w-full rounded-xl border border-border bg-card px-4 py-3"
        />
      </label>
      {error && <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{error}</p>}
      <button disabled={busy} className="w-full rounded-full bg-brand py-3 font-extrabold text-white disabled:opacity-60">
        {busy ? "Enviando…" : "Enviarme el enlace"}
      </button>
      <Link href={`/ingresar?next=${encodeURIComponent(next)}`} className="block text-center text-sm font-semibold text-muted underline underline-offset-4">
        Volver a ingresar
      </Link>
    </form>
  );
}
