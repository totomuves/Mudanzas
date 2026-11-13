"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/Icon";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setState(error ? "error" : "sent");
  }

  if (state === "sent") {
    return <p className="flex items-center gap-2 rounded-xl bg-accent/15 p-4 font-bold text-accent"><Icon name="mail" className="h-5 w-5" strokeWidth={2.2} />Revisa tu correo y abre el enlace.</p>;
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="tu@correo.cl"
        className="w-full rounded-xl border border-border bg-card px-4 py-3"
      />
      <button disabled={state === "sending"} className="w-full rounded-full bg-brand py-3 font-extrabold text-white disabled:opacity-60">
        {state === "sending" ? "Enviando…" : "Enviar enlace"}
      </button>
      {state === "error" && <p className="text-sm font-bold text-pass">No pudimos enviar el correo. Intenta de nuevo.</p>}
    </form>
  );
}
