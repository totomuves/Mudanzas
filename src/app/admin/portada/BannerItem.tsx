"use client";

import { useState } from "react";
import { BannerCard } from "@/components/BannerCard";
import type { HomeBanner } from "@/lib/types";
import { BannerForm } from "./BannerForm";
import { Icon } from "@/components/Icon";
import { deleteBanner, moveBanner } from "./actions";

export function BannerItem({ banner, first, last }: { banner: HomeBanner; first: boolean; last: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <li className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${banner.active ? "bg-accent/12 text-accent" : "bg-surface text-muted"}`}>
          {banner.active ? "Visible" : "Oculto"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1 text-sm font-bold">
          <form action={moveBanner}>
            <input type="hidden" name="id" value={banner.id} />
            <input type="hidden" name="dir" value="up" />
            <button disabled={first} className="rounded-full px-3 py-1.5 hover:bg-surface disabled:opacity-30" aria-label="Subir"><Icon name="up" className="h-4 w-4" strokeWidth={2.2} /></button>
          </form>
          <form action={moveBanner}>
            <input type="hidden" name="id" value={banner.id} />
            <input type="hidden" name="dir" value="down" />
            <button disabled={last} className="rounded-full px-3 py-1.5 hover:bg-surface disabled:opacity-30" aria-label="Bajar"><Icon name="down" className="h-4 w-4" strokeWidth={2.2} /></button>
          </form>
          <button onClick={() => setEditing((v) => !v)} className="rounded-full px-3 py-1.5 hover:bg-surface">
            {editing ? "Cerrar" : "Editar"}
          </button>
          {confirmDelete ? (
            <form action={deleteBanner} className="flex items-center gap-1">
              <input type="hidden" name="id" value={banner.id} />
              <button className="rounded-full bg-pass px-3 py-1.5 text-white">Sí, eliminar</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-full px-3 py-1.5 hover:bg-surface">No</button>
            </form>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="rounded-full px-3 py-1.5 text-pass hover:bg-surface">Eliminar</button>
          )}
        </div>
      </div>
      {editing ? (
        <BannerForm banner={banner} onDone={() => setEditing(false)} />
      ) : (
        <div className={banner.active ? "" : "opacity-50"}>
          <BannerCard banner={banner} />
        </div>
      )}
    </li>
  );
}
