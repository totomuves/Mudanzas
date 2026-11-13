import type { Metadata } from "next";
import { RecoverForm } from "./RecoverForm";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default async function RecuperarPage({ searchParams }: PageProps<"/recuperar">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";
  return (
    <div className="mx-auto max-w-sm space-y-6 py-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-black">Recuperar contraseña</h1>
        <p className="text-muted">
          Escribe tu correo y te enviamos un enlace para crear una contraseña nueva. Sirve también si siempre entraste
          con enlace y nunca tuviste contraseña.
        </p>
      </div>
      <RecoverForm next={next} />
    </div>
  );
}
