"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { formatCLP } from "@/lib/format";
import { COMUNAS } from "@/lib/comunas";
import { SIZES, SIZE_KEYS, VEHICLE_KINDS, type VehicleKind } from "@/lib/delivery";
import type { PricingSettings } from "@/lib/shipping-pricing";
import { savePricing, simulateShipping, type ShippingState, type SimResult } from "./actions";

const input = "w-full rounded-xl border border-border bg-background px-3 py-2";
const km = (n: number) => `${n.toLocaleString("es-CL", { maximumFractionDigits: 1 })} km`;
const hrs = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${h.toLocaleString("es-CL", { maximumFractionDigits: 1 })} h`);

export function PricingPanel({ pricing, vehicleCount }: { pricing: PricingSettings; vehicleCount: number }) {
  const [state, action, pending] = useActionState<ShippingState, FormData>(savePricing, {});
  const [mode, setMode] = useState(pricing.pricing_mode);
  const [margin, setMargin] = useState(String(pricing.margin_pct));
  const [min, setMin] = useState(String(pricing.min_price));
  const [maxKm, setMaxKm] = useState(String(pricing.max_km));
  const [roundTo, setRoundTo] = useState(String(pricing.round_to));
  const [share, setShare] = useState(String(pricing.trip_share_pct));

  // Simulador
  const [comuna, setComuna] = useState("");
  const [address, setAddress] = useState("");
  const [size, setSize] = useState("grande");
  const [qty, setQty] = useState("1");
  const [kg, setKg] = useState("");
  const [sim, setSim] = useState<SimResult | null>(null);
  const [simulating, startSim] = useTransition();
  const n = (s: string) => Number(s.replace(",", ".")) || 0;

  function simulate() {
    startSim(async () => {
      setSim(
        await simulateShipping({
          comuna, address, size, quantity: n(qty), kg: n(kg) || undefined,
          margin_pct: n(margin), min_price: n(min), max_km: n(maxKm) || 60, round_to: n(roundTo) || 1, trip_share_pct: n(share) || 100,
        }),
      );
    });
  }

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <input type="hidden" name="pricing_mode" value={mode} />
        <h2 className="text-lg font-black">¿Cómo cobras el despacho?</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["fijo", "Precio fijo por comuna", "Tú defines cuánto cuesta cada comuna (la lista de abajo).", "pin"],
              ["automatico", "Automático según el gasto", "La app calcula el costo real del viaje y le suma tu ganancia.", "calculator"],
            ] as const
          ).map(([value, label, hint, icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`rounded-2xl border-2 p-3 text-left ${mode === value ? "border-foreground bg-surface" : "border-border"}`}
            >
              <Icon name={icon} className="mb-1 h-6 w-6" />
              <span className="block font-bold">{label}</span>
              <span className="text-xs text-muted">{hint}</span>
            </button>
          ))}
        </div>

        {mode === "automatico" && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Costo del viaje = km de ida y vuelta × bencina por km + peajes + horas (manejo, carga y descarga) × chofer por hora.
              Se elige el vehículo más barato que pueda llevar el peso y el volumen. Los gastos de cada vehículo se ingresan en{" "}
              <Link href="/admin/despacho/ajustes" className="font-bold underline">Vehículos y horarios</Link>.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="space-y-1">
                <span className="block text-xs font-bold">Ganancia (%)</span>
                <input name="margin_pct" value={margin} onChange={(e) => setMargin(e.target.value)} inputMode="decimal" className={input} />
              </label>
              <label className="space-y-1">
                <span className="block text-xs font-bold">Precio mínimo (CLP)</span>
                <input name="min_price" value={min} onChange={(e) => setMin(e.target.value)} inputMode="numeric" className={input} />
              </label>
              <label className="space-y-1">
                <span className="block text-xs font-bold">Distancia máxima (km)</span>
                <input name="max_km" value={maxKm} onChange={(e) => setMaxKm(e.target.value)} inputMode="numeric" className={input} />
              </label>
              <label className="space-y-1">
                <span className="block text-xs font-bold">Redondear a (CLP)</span>
                <select name="round_to" value={roundTo} onChange={(e) => setRoundTo(e.target.value)} className={input}>
                  {[1, 10, 100, 500, 1000].map((r) => <option key={r} value={r}>{r === 1 ? "Sin redondeo" : formatCLP(r)}</option>)}
                </select>
              </label>
            </div>
            <label className="block space-y-1">
              <span className="block text-xs font-bold">Parte del viaje que paga cada despacho: {share}%</span>
              <input type="range" name="trip_share_pct" min={10} max={100} step={5} value={share} onChange={(e) => setShare(e.target.value)} className="w-full accent-[var(--brand)]" />
              <span className="block text-xs text-muted">
                100% cobra el viaje completo de ida y vuelta. Si en cada salida sueles entregar 3 pedidos, prueba con 35% a 50%: el viaje se reparte entre ellos.
              </span>
            </label>
            <p className="text-xs text-muted">
              El precio mínimo cubre los viajes cortos. La ganancia cubre imprevistos como tráfico o esperas. Más lejos que la distancia
              máxima desde la bodega, no se ofrece despacho.
            </p>
            {vehicleCount === 0 && (
              <p className="flex gap-2 rounded-xl bg-brand-soft p-3 text-sm font-bold">
                <Icon name="truck" className="h-5 w-5 shrink-0" />
                Aún no registras vehículos: mientras tanto se usan gastos de referencia (auto, camioneta, furgón y camión).
              </p>
            )}
          </div>
        )}
        {mode === "fijo" && (
          <>
            <input type="hidden" name="margin_pct" value={margin} />
            <input type="hidden" name="min_price" value={min} />
            <input type="hidden" name="max_km" value={maxKm} />
            <input type="hidden" name="round_to" value={roundTo} />
            <input type="hidden" name="trip_share_pct" value={share} />
          </>
        )}

        {state.error && <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{state.error}</p>}
        {state.ok && <p className="rounded-xl bg-surface p-3 text-sm font-bold">{state.ok}</p>}
        <button disabled={pending} className="rounded-full bg-foreground px-6 py-3 font-extrabold text-background disabled:opacity-60">
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </form>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <Icon name="calculator" className="h-5 w-5" />
            Simular un despacho
          </h2>
          <p className="text-sm text-muted">Prueba una dirección y una carga para ver el costo, el precio y qué vehículo conviene.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <select value={comuna} onChange={(e) => setComuna(e.target.value)} className={input} aria-label="Comuna">
            <option value="">Comuna</option>
            {COMUNAS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Dirección (opcional)" className={input} />
          <select value={size} onChange={(e) => setSize(e.target.value)} className={input} aria-label="Tamaño">
            {SIZE_KEYS.map((k) => <option key={k} value={k}>{SIZES[k].label}: {SIZES[k].hint}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" placeholder="Cantidad" aria-label="Cantidad" className={input} />
            <input value={kg} onChange={(e) => setKg(e.target.value)} inputMode="decimal" placeholder="Peso c/u kg (opcional)" aria-label="Peso" className={input} />
          </div>
        </div>
        <button
          type="button"
          onClick={simulate}
          disabled={!comuna || simulating}
          className="rounded-full border-2 border-foreground px-5 py-2.5 text-sm font-extrabold disabled:opacity-50"
        >
          {simulating ? "Calculando…" : "Calcular"}
        </button>

        {sim?.error && <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{sim.error}</p>}
        {sim?.options && sim.options.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted">
              {km(sim.kmOneWay ?? 0)} y unos {Math.round(sim.minOneWay ?? 0)} min desde la bodega
              {sim.source === "google" ? " (con tráfico de Google)" : " (estimado)"}
              {sim.geoSource === "comuna" ? ". Sin dirección exacta: se usó el centro de la comuna." : "."}
              {sim.usingPresets ? " Con vehículos de referencia." : ""}
            </p>
            <ul className="space-y-2">
              {sim.options.map((o, i) => (
                <li key={`${o.name}-${i}`} className={`rounded-xl border-2 p-3 ${i === 0 ? "border-foreground bg-surface" : "border-border"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="flex items-center gap-2 font-extrabold">
                      <Icon name="truck" className="h-5 w-5" />
                      {o.name}
                      <span className="text-xs font-bold text-muted">{VEHICLE_KINDS[o.kind as VehicleKind]?.label}</span>
                      {i === 0 && <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-black text-background">Sugerido</span>}
                    </p>
                    <p className="text-right">
                      <span className="block text-lg font-black">{formatCLP(o.price)}</span>
                      <span className="text-xs text-muted">costo {formatCLP(o.cost)}</span>
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {o.trips > 1 ? `${o.trips} viajes · ` : ""}
                    {km(o.km)} · {hrs(o.hours)} · bencina {formatCLP(o.fuel)} · peajes {formatCLP(o.tolls)} · equipo {formatCLP(o.crew)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
