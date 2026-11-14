"use client";

import { useActionState, useState } from "react";
import { saveShippingRates, type ShippingState } from "./actions";

type Row = { comuna: string; price: number | null; active: boolean };

export function ShippingForm({ rows }: { rows: Row[] }) {
  const [state, action, pending] = useActionState<ShippingState, FormData>(saveShippingRates, {});
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(rows.map((r) => [r.comuna, r.price == null ? "" : String(r.price)])),
  );
  const [bulk, setBulk] = useState("");
  const [filter, setFilter] = useState("");

  const visible = rows.filter((r) => r.comuna.toLowerCase().includes(filter.trim().toLowerCase()));
  const conPrecio = Object.values(prices).filter((p) => p !== "").length;

  function fillEmpty() {
    const v = bulk.replace(/\D/g, "");
    if (!v) return;
    setPrices((p) => Object.fromEntries(Object.entries(p).map(([k, x]) => [k, x === "" ? v : x])));
  }

  return (
    <form action={action} className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-4">
        <label className="space-y-1">
          <span className="block text-sm font-bold">Mismo precio para las vacías</span>
          <input
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            inputMode="numeric"
            placeholder="Ej: 5990"
            className="w-36 rounded-xl border border-border bg-background px-3 py-2"
          />
        </label>
        <button type="button" onClick={fillEmpty} className="rounded-full border border-border px-4 py-2 text-sm font-bold hover:bg-surface">
          Rellenar
        </button>
        <label className="ml-auto space-y-1">
          <span className="block text-sm font-bold">Buscar comuna</span>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-48 rounded-xl border border-border bg-background px-3 py-2"
          />
        </label>
      </div>

      <p className="text-sm text-muted">{conPrecio} comunas con despacho.</p>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left">
            <tr>
              <th className="p-3">Comuna</th>
              <th className="p-3">Precio (CLP)</th>
              <th className="p-3 text-center">Activa</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.comuna} className={`border-t border-border ${visible.includes(r) ? "" : "hidden"}`}>
                <td className="p-3 font-semibold">
                  <input type="hidden" name="comuna" value={r.comuna} />
                  {r.comuna}
                </td>
                <td className="p-3">
                  <input
                    name={`precio:${r.comuna}`}
                    value={prices[r.comuna] ?? ""}
                    onChange={(e) => setPrices((p) => ({ ...p, [r.comuna]: e.target.value.replace(/\D/g, "") }))}
                    inputMode="numeric"
                    placeholder="Sin despacho"
                    className="w-32 rounded-lg border border-border bg-background px-3 py-1.5"
                  />
                </td>
                <td className="p-3 text-center">
                  <input
                    type="checkbox"
                    name={`activa:${r.comuna}`}
                    defaultChecked={r.active}
                    aria-label={`Despacho activo en ${r.comuna}`}
                    className="h-4 w-4"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-4">
        <label className="space-y-1">
          <span className="block text-sm font-bold">Agregar otra comuna</span>
          <input name="nueva_comuna" placeholder="Ej: Rancagua" className="w-48 rounded-xl border border-border bg-background px-3 py-2" />
        </label>
        <label className="space-y-1">
          <span className="block text-sm font-bold">Precio</span>
          <input name="nueva_precio" inputMode="numeric" placeholder="Ej: 12990" className="w-36 rounded-xl border border-border bg-background px-3 py-2" />
        </label>
      </div>

      {state.error && <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{state.error}</p>}
      {state.ok && <p className="rounded-xl bg-accent/12 p-3 text-sm font-bold text-accent">{state.ok}</p>}

      <button disabled={pending} className="rounded-full bg-brand px-6 py-3 font-extrabold text-white disabled:opacity-60">
        {pending ? "Guardando…" : "Guardar precios"}
      </button>
      <p className="text-xs text-muted">Desmarca “Activa” para pausar una comuna sin perder su precio.</p>
    </form>
  );
}
