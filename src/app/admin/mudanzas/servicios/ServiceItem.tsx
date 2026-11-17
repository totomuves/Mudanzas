"use client";

import { useState } from "react";
import { Icon, ServiceIcon } from "@/components/Icon";
import { formatCLP } from "@/lib/format";
import type { ServiceType } from "@/lib/moving";
import { ServiceForm } from "./ServiceForm";
import { moveService } from "./actions";

export function ServiceItem({ service, first, last }: { service: ServiceType; first: boolean; last: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <li className={`space-y-4 rounded-2xl border border-border bg-card p-4 ${service.active ? "" : "opacity-70"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface">
          <ServiceIcon slug={service.slug} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">{service.name}</p>
          <p className="text-sm text-muted">
            Desde <b className="text-foreground">{formatCLP(service.base_price)}</b> · {service.crew_size}{" "}
            {service.crew_size === 1 ? "persona" : "personas"} · ~{Number(service.est_hours).toLocaleString("es-CL")} h
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${service.active ? "bg-accent/12 text-accent" : "bg-surface text-muted"}`}>
          {service.active ? "Visible" : "Oculto"}
        </span>
        <div className="flex items-center gap-1 text-sm font-bold">
          <form action={moveService}>
            <input type="hidden" name="slug" value={service.slug} />
            <input type="hidden" name="dir" value="up" />
            <button disabled={first} className="rounded-full px-3 py-1.5 hover:bg-surface disabled:opacity-30" aria-label="Subir"><Icon name="up" className="h-4 w-4" strokeWidth={2.2} /></button>
          </form>
          <form action={moveService}>
            <input type="hidden" name="slug" value={service.slug} />
            <input type="hidden" name="dir" value="down" />
            <button disabled={last} className="rounded-full px-3 py-1.5 hover:bg-surface disabled:opacity-30" aria-label="Bajar"><Icon name="down" className="h-4 w-4" strokeWidth={2.2} /></button>
          </form>
          <button onClick={() => setEditing((v) => !v)} className="rounded-full px-3 py-1.5 hover:bg-surface">
            {editing ? "Cerrar" : "Editar"}
          </button>
        </div>
      </div>
      {editing && <ServiceForm service={service} onDone={() => setEditing(false)} />}
    </li>
  );
}
