import type { Metadata } from "next";
import { hasSupabaseEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/admin";
import { SetupNotice } from "@/components/SetupNotice";
import { InviteForm, MemberItem, RoleForm, RoleItem, type Member, type Role } from "./TeamForms";

export const metadata: Metadata = { title: "Equipo" };

export default async function EquipoPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { supabase, user } = await requireAdmin();
  const [rolesRes, teamRes] = await Promise.all([supabase.rpc("list_admin_roles"), supabase.rpc("list_team")]);

  if (rolesRes.error || teamRes.error) {
    return (
      <div className="mx-auto max-w-xl space-y-3 rounded-2xl border border-border bg-card p-4">
        <h1 className="text-2xl font-black">Equipo</h1>
        <p className="text-sm text-muted">
          Falta un paso: corre la migración <b>20261114130000_roles_equipo.sql</b> en el SQL Editor de Supabase y vuelve
          a cargar esta página.
        </p>
      </div>
    );
  }

  const roles = (rolesRes.data ?? []) as Role[];
  const team = (teamRes.data ?? []) as Member[];
  const myEmail = user.email?.toLowerCase();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-black">Equipo</h1>
        <p className="text-sm text-muted">
          Crea roles con las secciones que cada uno puede modificar e invita personas por correo. Solo los
          administradores totales ven esta página.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-extrabold">Roles</h2>
        {roles.length > 0 && (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {roles.map((r) => <RoleItem key={r.id} role={r} />)}
          </ul>
        )}
        <details open={roles.length === 0} className="rounded-2xl border border-border bg-card p-4">
          <summary className="cursor-pointer font-extrabold">+ Crear rol</summary>
          <div className="pt-3"><RoleForm /></div>
        </details>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-extrabold">Personas</h2>
        <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <h3 className="font-extrabold">Invitar a alguien</h3>
          <p className="text-sm text-muted">
            Escribe su correo y elige el rol. Si ya entró alguna vez a la app, el acceso es inmediato; si no, tendrá
            acceso apenas entre en <b>Ingresar</b> con ese correo.
          </p>
          <InviteForm roles={roles} />
        </div>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {team.map((m) => (
            <MemberItem key={m.email} member={m} roles={roles} isMe={m.email === myEmail} />
          ))}
        </ul>
      </section>
    </div>
  );
}
