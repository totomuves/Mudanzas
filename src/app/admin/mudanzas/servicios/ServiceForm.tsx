"use client";

import { useActionState } from "react";
import type { ServiceType } from "@/lib/moving";
import { saveService, type ServiceState } from "./actions";

const input = "w-full rounded-xl border border-border bg-background px-3 py-2";

/** Crear o editar un servicio de mudanza (lo que aparece en "Precios"). */
export function ServiceForm({ service, onDone }: { service?: ServiceType; onDone?: () => void }) {
  const [state, action, pending] = useActionState<ServiceState, FormData>(async (prev, fd) => {
    const res = await saveService(prev, fd);
    if (res.ok) onDone?.();
    return res;
  }, {});
  const uid = service?.slug ?? "nuevo";

  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      {service && <input type="hidden" name="slug" value={service.slug} />}
      <div className="space-y-3">
        <label className="block space-y-1 text-sm font-bold">
          Nombre
          <input name="name" required maxLength={60} defaultValue={service?.name} placeholder="Depto 1–2 dormitorios" className={`${input} font-normal`} />
        </label>
        <label className="block space-y-1 text-sm font-bold">
          Descripción corta
          <input name="description" maxLength={200} defaultValue={service?.description} placeholder="Mudanza completa de un departamento pequeño." className={`${input} font-normal`} />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block space-y-1 text-sm font-bold">
            Precio desde
            <input name="base_price" inputMode="numeric" required defaultValue={service?.base_price} placeholder="120000" className={`${input} font-normal`} />
          </label>
          <label className="block space-y-1 text-sm font-bold">
            Personas
            <input name="crew_size" type="number" min={1} max={20} required defaultValue={service?.crew_size ?? 2} className={`${input} font-normal`} />
          </label>
          <label className="block space-y-1 text-sm font-bold">
            Horas aprox.
            <input name="est_hours" inputMode="decimal" required defaultValue={service ? String(service.est_hours).replace(".", ",") : "3"} className={`${input} font-normal`} />
          </label>
        </div>
      </div>
      <div className="space-y-3">
        <label className="block space-y-1 text-sm font-bold" htmlFor={`includes-${uid}`}>
          Qué incluye <span className="font-normal text-muted">(uno por línea)</span>
          <textarea
            id={`includes-${uid}`}
            name="includes"
            rows={5}
            defaultValue={service?.includes.join("\n")}
            placeholder={"Sprinter cerrada 10 m³\n1 ayudante\nProtección de muebles"}
            className={`${input} font-normal`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" name="active" defaultChecked={service?.active ?? true} className="h-4 w-4 accent-[var(--brand)]" />
          Visible en la página y el cotizador
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button disabled={pending} className="rounded-full bg-brand px-6 py-3 font-extrabold text-white disabled:opacity-60">
          {pending ? "Guardando…" : service ? "Guardar cambios" : "Crear servicio"}
        </button>
        {state.error && <p className="text-sm font-bold text-pass">{state.error}</p>}
        {state.ok && <p className="text-sm font-bold text-accent">{state.ok}</p>}
      </div>
    </form>
  );
}
