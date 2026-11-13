import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { getUser } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
import { PasswordForm } from "./PasswordForm";

export const metadata: Metadata = { title: "Contraseña" };

/** Crear o cambiar la contraseña (también es el destino del correo de recuperación). */
export default async function ClavePage({ searchParams }: PageProps<"/cuenta/clave">) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";
  const { user } = await getUser();
  if (!user || user.is_anonymous) redirect(`/ingresar?next=${encodeURIComponent("/cuenta/clave")}`);

  return (
    <div className="mx-auto max-w-sm space-y-6 py-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-black">Crear o cambiar contraseña</h1>
        <p className="text-muted">
          Con una contraseña puedes entrar con <b>{user.email}</b> sin esperar un enlace en tu correo. El enlace sigue
          funcionando igual.
        </p>
      </div>
      <PasswordForm next={next} />
    </div>
  );
}
