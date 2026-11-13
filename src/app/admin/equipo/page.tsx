import type { Metadata } from "next";
import { hasSupabaseEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/admin";
import { SetupNotice } from "@/components/SetupNotice";
import { AddAdminForm, RemoveAdminButton } from "./TeamForms";

export const metadata: Metadata = { title: "Equipo" };

export default async function EquipoPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { supabase, user } = await requireAdmin();
  const { data } = await supabase.rpc("list_admins");
  const admins = (data ?? []) as { id: string; email: string; created_at: string }[];

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-black">Equipo de administradores</h1>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-extrabold">Agregar administrador</h2>
        <p className="text-sm text-muted">
          La persona debe haber entrado al menos una vez en <b>/ingresar</b> con su correo. Después la agregas aquí y
          podrá subir productos, ver pedidos y la agenda.
        </p>
        <AddAdminForm />
      </section>

      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {admins.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 p-4">
            <span className="min-w-0">
              <span className="block truncate font-bold">{a.email}</span>
              {a.id === user.id && <span className="text-xs text-muted">Tú</span>}
            </span>
            {a.id !== user.id && <RemoveAdminButton email={a.email} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
