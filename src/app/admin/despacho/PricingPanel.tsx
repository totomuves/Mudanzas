"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { formatCLP } from "@/lib/format";
import { COMUNAS } from "@/lib/comunas";
import { ACCESSORIES, ACCESSORY_KEYS, SIZES, SIZE_KEYS, VEHICLE_KINDS, type VehicleKind } from "@/lib/delivery";
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
  const [fragileFee, setFragileFee] = useState(String(pricing.fragile_fee));
  const [luxuryFee, setLuxuryFee] = useState(String(pricing.luxury_fee));
  const [luxuryPct, setLuxuryPct] = useState(String(pricing.luxury_pct));
  const [tollKm, setTollKm] = useState(String(pricing.toll_per_km));
  const [truckToll, setTruckToll] = useState(String(pricing.truck_toll_factor));

  // Simulador
  const [comuna, setComuna] = useState("");
  const [address, setAddress] = useState("");
  const [size, setSize] = useState("grande");
  const [qty, setQty] = useState("1");
  const [kg, setKg] = useState("");
  const [care, setCare] = useState("");
  const [value, setValue] = useState("");
  const [needs, setNeeds] = useState<string[]>([]);
  const [sim, setSim] = useState<SimResult | null>(null);
  const [simulating, startSim] = useTransition();
  const n = (s: string) => Number(s.replace(",", ".")) || 0;

  function simulate() {
    startSim(async () => {
      setSim(
        await simulateShipping({
          comuna, address, size, quantity: n(qty), kg: n(kg) || undefined,
          margin_pct: n(margin), min_price: n(min), max_km: n(maxKm) || 60, round_to: n(roundTo) || 1, trip_share_pct: n(share) || 100,
          fragile_fee: n(fragileFee), luxury_fee: n(luxuryFee), luxury_pct: n(luxuryPct), toll_per_km: n(tollKm), truck_toll_factor: n(truckToll) || 1,
          care, value: n(value), needs,
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

            <div className="space-y-2 rounded-xl bg-surface p-3">
              <p className="text-sm font-bold">Peajes de autopista</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="block text-xs font-bold">Peaje por km de autopista (CLP)</span>
                  <input name="toll_per_km" value={tollKm} onChange={(e) => setTollKm(e.target.value)} inputMode="numeric" className={input} />
                </label>
                <label className="space-y-1">
                  <span className="block text-xs font-bold">El camión paga (veces un auto)</span>
                  <input name="truck_toll_factor" value={truckToll} onChange={(e) => setTruckToll(e.target.value)} inputMode="decimal" className={input} />
                </label>
              </div>
              <p className="text-xs text-muted">
                La ruta se busca en OpenStreetMap (gratis) y se cuentan los km que van por autopistas con TAG, ida y vuelta.
                El TAG en Santiago va de unos $60 a $250 por km según la hora; $120 es un promedio para media mañana. Usa 0 para no cobrarlos.
              </p>
            </div>

            <div className="space-y-2 rounded-xl bg-surface p-3">
              <p className="text-sm font-bold">Recargos por cuidado especial</p>
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1">
                  <span className="block text-xs font-bold">Frágil, por unidad (CLP)</span>
                  <input name="fragile_fee" value={fragileFee} onChange={(e) => setFragileFee(e.target.value)} inputMode="numeric" className={input} />
                </label>
                <label className="space-y-1">
                  <span className="block text-xs font-bold">Lujo o arte, fijo (CLP)</span>
                  <input name="luxury_fee" value={luxuryFee} onChange={(e) => setLuxuryFee(e.target.value)} inputMode="numeric" className={input} />
                </label>
                <label className="space-y-1">
                  <span className="block text-xs font-bold">Lujo o arte, % del valor</span>
                  <input name="luxury_pct" value={luxuryPct} onChange={(e) => setLuxuryPct(e.target.value)} inputMode="decimal" className={input} />
                </label>
              </div>
              <p className="text-xs text-muted">
                Se suman al despacho por cada producto marcado, sin ganancia ni reparto del viaje. Lo de lujo u obra de arte se cobra
                por su valor y no por km: el riesgo de un cuadro es el mismo a 5 o a 30 km, y los km ya están en el viaje.
                Si un producto es de lujo, no se le cobra además el de frágil.
              </p>
            </div>
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
            <input type="hidden" name="toll_per_km" value={tollKm} />
            <input type="hidden" name="truck_toll_factor" value={truckToll} />
            <input type="hidden" name="fragile_fee" value={fragileFee} />
            <input type="hidden" name="luxury_fee" value={luxuryFee} />
            <input type="hidden" name="luxury_pct" value={luxuryPct} />
            <p className="text-xs text-muted">Los recargos por frágil, lujo y peajes de autopista se usan con el precio automático.</p>
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
          <select value={care} onChange={(e) => setCare(e.target.value)} className={input} aria-label="Cuidado">
            <option value="">Cuidado normal</option>
            <option value="fragil">Frágil</option>
            <option value="lujo">Lujo u obra de arte</option>
          </select>
          {care === "lujo" ? (
            <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" placeholder="Valor del producto c/u (CLP)" aria-label="Valor" className={input} />
          ) : <span className="hidden sm:block" />}
        </div>
        <fieldset className="space-y-1">
          <legend className="text-xs font-bold">El vehículo necesita</legend>
          <div className="flex flex-wrap gap-2">
            {ACCESSORY_KEYS.map((k) => (
              <label key={k} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-bold" title={ACCESSORIES[k].hint}>
                <input
                  type="checkbox"
                  checked={needs.includes(k)}
                  onChange={(e) => setNeeds((xs) => (e.target.checked ? [...xs, k] : xs.filter((x) => x !== k)))}
                />
                {ACCESSORIES[k].label}
              </label>
            ))}
          </div>
        </fieldset>
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
              {sim.source === "google" ? " (con tráfico de Google)" : sim.roads === "osm" ? " (km por calles reales con OpenStreetMap, gratis; tiempo estimado)" : " (estimado)"}
              {sim.geoSource === "comuna" ? ". Sin dirección exacta: se usó el centro de la comuna." : "."}
              {sim.usingPresets ? " Con vehículos de referencia." : ""}
              {sim.tollKm == null
                ? " No se pudo revisar si la ruta va por autopista: solo cuentan los peajes fijos de cada vehículo."
                : sim.tollKm > 0.1
                  ? ` La ruta va ${km(sim.tollKm)} por autopistas con peaje (ida y vuelta).`
                  : " La ruta no pasa por autopistas con peaje."}
            </p>
            {!!sim.missing?.length && (
              <p className="flex gap-2 rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">
                <Icon name="truck" className="h-5 w-5 shrink-0" />
                Ningún vehículo tiene {sim.missing.join(" ni ")}. Se muestran los que sirven por tamaño; agrégalo en Vehículos y horarios si lo tiene.
              </p>
            )}
            {!!sim.handling?.total && (
              <p className="rounded-xl bg-surface p-3 text-sm">
                <span className="font-bold">Recargo por cuidado: {formatCLP(sim.handling.total)}</span>
                <span className="text-muted">
                  {sim.handling.luxury ? " (lujo u obra de arte: fijo + % del valor)" : " (frágil)"}. Se suma al precio de cada vehículo.
                </span>
              </p>
            )}
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
                      <span className="block text-lg font-black">{formatCLP(o.price + (sim.handling?.total ?? 0))}</span>
                      <span className="text-xs text-muted">costo {formatCLP(o.cost)}</span>
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {o.trips > 1 ? `${o.trips} viajes · ` : ""}
                    {km(o.km)} · {hrs(o.hours)} · bencina {formatCLP(o.fuel)} · peajes {formatCLP(o.tolls)}
                    {o.routeTolls > 0 ? ` (autopista ${formatCLP(o.routeTolls)})` : ""} · equipo {formatCLP(o.crew)}
                    {sim.handling?.total ? ` · viaje ${formatCLP(o.price)} + cuidado ${formatCLP(sim.handling.total)}` : ""}
                  </p>
                  {o.accessories.length > 0 && <p className="mt-0.5 text-xs text-muted">Accesorios: {o.accessories.join(", ")}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
