import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Ingresar" };

/** Google aparece solo cuando ya está configurado en Supabase (ver README). */
const GOOGLE_ON = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1";

export default async function IngresarPage({ searchParams }: PageProps<"/ingresar">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";
  return (
    <div className="mx-auto max-w-sm space-y-6 py-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-black">Ingresar</h1>
        <p className="text-muted">Para comprar, guardar tus gustos y ver tus pedidos.</p>
      </div>
      {sp.error && (
        <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">
          El enlace expiró o ya se usó. Ingresa de nuevo o pide otro.
        </p>
      )}
      <LoginForm next={next} google={GOOGLE_ON} />
    </div>
  );
}
