"use client";

import { useActionState, useState } from "react";
import { ADMIN_SECTIONS } from "@/lib/admin-sections";
import { deleteRole, removeMember, saveRole, setMember, type TeamState } from "./actions";

export type Role = { id: string; name: string; sections: string[]; members: number };

const input = "w-full rounded-xl border border-border bg-background px-4 py-3";

/** Formulario para crear un rol nuevo o editar uno existente. */
export function RoleForm({ role, onDone }: { role?: Role; onDone?: () => void }) {
  const [state, action, pending] = useActionState<TeamState, FormData>(async (prev, fd) => {
    const res = await saveRole(prev, fd);
    if (res.ok) onDone?.();
    return res;
  }, {});
  return (
    <form action={action} className="space-y-3">
      {role && <input type="hidden" name="id" value={role.id} />}
      <input name="name" required defaultValue={role?.name} placeholder="Nombre del rol (ej: Diseño)" className={input} />
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-bold">Puede ver y modificar:</legend>
        {ADMIN_SECTIONS.map((s) => (
          <label key={s.key} className="flex cursor-pointer items-start gap-2 rounded-xl border border-border p-3 has-[:checked]:border-brand has-[:checked]:bg-brand/5">
            <input type="checkbox" name="sections" value={s.key} defaultChecked={role?.sections.includes(s.key)} className="mt-1 accent-[var(--color-brand)]" />
            <span>
              <span className="block font-bold">{s.label}</span>
              <span className="block text-xs text-muted">{s.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <button disabled={pending} className="rounded-xl bg-brand px-5 py-3 font-extrabold text-white disabled:opacity-60">
        {pending ? "Guardando…" : role ? "Guardar cambios" : "Crear rol"}
      </button>
      <Message state={state} />
    </form>
  );
}

/** Un rol en la lista, con editar y eliminar. */
export function RoleItem({ role }: { role: Role }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const labels = ADMIN_SECTIONS.filter((s) => role.sections.includes(s.key)).map((s) => s.label);
  return (
    <li className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-extrabold">{role.name}</span>
        <span className="text-xs text-muted">
          {role.members === 1 ? "1 persona" : `${role.members} personas`}
        </span>
        <div className="ml-auto flex items-center gap-1 text-sm font-bold">
          <button onClick={() => setEditing((v) => !v)} className="rounded-full px-3 py-1.5 hover:bg-surface">
            {editing ? "Cerrar" : "Editar"}
          </button>
          {confirm ? (
            <form action={deleteRole} className="flex items-center gap-1">
              <input type="hidden" name="id" value={role.id} />
              <button className="rounded-full bg-pass px-3 py-1.5 text-white">Sí, eliminar</button>
              <button type="button" onClick={() => setConfirm(false)} className="rounded-full px-3 py-1.5 hover:bg-surface">No</button>
            </form>
          ) : (
            <button onClick={() => setConfirm(true)} className="rounded-full px-3 py-1.5 text-pass hover:bg-surface">Eliminar</button>
          )}
        </div>
      </div>
      {confirm && role.members > 0 && (
        <p className="text-xs text-pass">Las personas con este rol perderán el acceso al admin.</p>
      )}
      {editing ? (
        <RoleForm role={role} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {labels.map((l) => (
            <span key={l} className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-bold">{l}</span>
          ))}
        </div>
      )}
    </li>
  );
}

function RoleSelect({ roles, value, name = "role" }: { roles: Role[]; value?: string; name?: string }) {
  return (
    <select name={name} defaultValue={value ?? ""} required className="rounded-xl border border-border bg-background px-3 py-3 font-bold">
      <option value="" disabled>Elige un rol</option>
      {roles.map((r) => (
        <option key={r.id} value={r.id}>{r.name}</option>
      ))}
      <option value="owner">Administrador total</option>
    </select>
  );
}

/** Invitar a alguien por correo con un rol. */
export function InviteForm({ roles }: { roles: Role[] }) {
  const [state, action, pending] = useActionState<TeamState, FormData>(setMember, {});
  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input name="email" type="email" required placeholder="correo@ejemplo.cl" className={`${input} sm:flex-1`} />
        <RoleSelect roles={roles} />
        <button disabled={pending} className="rounded-xl bg-brand px-5 py-3 font-extrabold text-white disabled:opacity-60">
          {pending ? "…" : "Invitar"}
        </button>
      </div>
      <Message state={state} />
    </form>
  );
}

export type Member = {
  email: string;
  is_owner: boolean;
  role_id: string | null;
  role_name: string | null;
  status: "activo" | "invitado";
};

/** Una persona del equipo: cambiar su rol o quitarle el acceso. */
export function MemberItem({ member, roles, isMe }: { member: Member; roles: Role[]; isMe: boolean }) {
  const [state, action, pending] = useActionState<TeamState, FormData>(setMember, {});
  const [removeState, removeAction, removing] = useActionState<TeamState, FormData>(removeMember, {});
  const msg = removeState.error || removeState.ok ? removeState : state;
  return (
    <li className="space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{member.email}</span>
          <span className="text-xs text-muted">
            {isMe ? "Tú · " : ""}
            {member.status === "invitado" ? "Invitado: tendrá acceso cuando entre con este correo" : "Activo"}
          </span>
        </span>
        {isMe ? (
          <span className="rounded-full bg-surface px-3 py-1 text-xs font-bold">Administrador total</span>
        ) : (
          <>
            <form action={action} className="flex items-center gap-1">
              <input type="hidden" name="email" value={member.email} />
              <RoleSelect key={member.is_owner ? "owner" : member.role_id} roles={roles} value={member.is_owner ? "owner" : member.role_id ?? ""} />
              <button disabled={pending} className="rounded-full px-3 py-1.5 text-sm font-bold hover:bg-surface disabled:opacity-60">
                Cambiar
              </button>
            </form>
            <form
              action={removeAction}
              onSubmit={(e) => {
                const q = member.status === "invitado" ? `¿Cancelar la invitación de ${member.email}?` : `¿Quitarle el acceso al admin a ${member.email}?`;
                if (!window.confirm(q)) e.preventDefault();
              }}
            >
              <input type="hidden" name="email" value={member.email} />
              <button disabled={removing} className="rounded-full px-3 py-1.5 text-sm font-bold text-pass hover:bg-surface disabled:opacity-60">
                Quitar
              </button>
            </form>
          </>
        )}
      </div>
      <Message state={msg} />
    </li>
  );
}

function Message({ state }: { state: TeamState }) {
  if (state.ok) return <p className="rounded-xl bg-accent/15 p-3 text-sm font-bold text-accent">{state.ok}</p>;
  if (state.error) return <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{state.error}</p>;
  return null;
}
