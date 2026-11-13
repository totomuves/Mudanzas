import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Ingresar" };

export default async function IngresarPage({ searchParams }: PageProps<"/ingresar">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/admin";
  return (
    <div className="mx-auto max-w-sm space-y-4 py-8">
      <h1 className="text-3xl font-black">Ingresar</h1>
      <p className="text-muted">Te enviaremos un enlace mágico a tu correo. Sin contraseñas.</p>
      {sp.error && <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">El enlace expiró o no es válido. Pide otro.</p>}
      <LoginForm next={next} />
    </div>
  );
}
