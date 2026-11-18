"use client";

import { useActionState, useState } from "react";
import { Icon } from "@/components/Icon";
import { COMUNAS } from "@/lib/comunas";
import type { Warehouse } from "@/lib/delivery";
import type { FormState } from "@/lib/routing/manage";
import { ConfirmForm } from "@/components/ConfirmForm";

type FormAction = (prev: FormState, f: FormData) => Promise<FormState>;
const input = "w-full rounded-xl border border-border bg-background px-3 py-2";

export function WarehouseForm({ warehouse: w, saveAction, onDone }: { warehouse?: Warehouse; saveAction: FormAction; onDone?: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(async (p, f) => {
    const r = await saveAction(p, f);
    if (r.ok) onDone?.();
    return r;
  }, {});
  return (
    <form action={action} className="space-y-3">
      {w && <input type="hidden" name="id" value={w.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="block text-sm font-bold">Nombre</span>
          <input name="name" defaultValue={w?.name ?? ""} placeholder="Bodega Toto" required className={input} />
        </label>
        <label className="space-y-1">
          <span className="block text-sm font-bold">Comuna</span>
          <select name="comuna" defaultValue={w?.comuna ?? ""} className={input}>
            <option value="">—</option>
            {COMUNAS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="block text-sm font-bold">Dirección</span>
          <input name="address" defaultValue={w?.address ?? ""} placeholder="Av. Ejemplo 1234" className={input} />
          <span className="block text-xs text-muted">
            {w?.lat != null ? `Ubicada en el mapa (${w.lat.toFixed(4)}, ${w.lng?.toFixed(4)}).` : "Con calle y número para calcular bien las rutas."}
          </span>
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="block text-sm font-bold">Notas para el chofer (opcional)</span>
          <input name="notes" defaultValue={w?.notes ?? ""} placeholder="Portón verde, tocar timbre 2" className={input} />
        </label>
      </div>
      <div className="flex flex-wrap gap-4 text-sm font-bold">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="is_default" defaultChecked={w?.is_default ?? false} /> Bodega principal
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={w?.active ?? true} /> Activa
        </label>
      </div>
      <p className="text-xs text-muted">La principal recibe los productos sin bodega asignada.</p>
      {state.error && <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{state.error}</p>}
      {state.ok && <p className="rounded-xl bg-accent/10 p-3 text-sm font-bold text-accent">{state.ok}</p>}
      <button disabled={pending} className="rounded-full bg-foreground px-6 py-3 font-extrabold text-background disabled:opacity-60">
        {pending ? "Guardando…" : w ? "Guardar cambios" : "Agregar bodega"}
      </button>
    </form>
  );
}

export function WarehouseItem({
  warehouse: w, products, vehicles, saveAction, deleteAction,
}: {
  warehouse: Warehouse;
  products: number;
  vehicles: string[];
  saveAction: FormAction;
  deleteAction: (f: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <li className="rounded-2xl border border-border bg-card p-4 sm:col-span-2">
        <WarehouseForm warehouse={w} saveAction={saveAction} onDone={() => setEditing(false)} />
        <button onClick={() => setEditing(false)} className="mt-2 text-sm font-bold text-muted">Cancelar</button>
      </li>
    );
  }
  return (
    <li className={`flex items-start gap-3 rounded-2xl border border-border bg-card p-4 ${w.active ? "" : "opacity-60"}`}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface">
        <Icon name="warehouse" className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-extrabold">
          {w.name} {w.is_default && <span className="ml-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold">Principal</span>}
        </p>
        <p className="text-sm">{w.address ? `${w.address}${w.comuna ? `, ${w.comuna}` : ""}` : <span className="font-bold text-pass">Falta la dirección</span>}</p>
        <p className="text-xs text-muted">
          {products} {products === 1 ? "producto" : "productos"}
          {vehicles.length > 0 ? ` · Parking de ${vehicles.join(", ")}` : ""}
          {w.active ? "" : " · Pausada"}
        </p>
        {w.notes && <p className="text-xs text-muted">{w.notes}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <button onClick={() => setEditing(true)} className="rounded-full border border-border px-3 py-1 text-xs font-bold">Editar</button>
        {!w.is_default && (
          <ConfirmForm action={deleteAction} hidden={{ id: w.id }} message={`¿Borrar ${w.name}? Sus productos pasan a la bodega principal.`}>
            <button className="rounded-full px-3 py-1 text-xs font-bold text-pass">Borrar</button>
          </ConfirmForm>
        )}
      </div>
    </li>
  );
}
