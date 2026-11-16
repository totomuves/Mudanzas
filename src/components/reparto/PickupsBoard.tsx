import type { ReactNode } from "react";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Icon } from "@/components/Icon";
import { StatusDot, type StatusTone } from "@/components/StatusDot";
import { COMUNAS } from "@/lib/comunas";
import { SIZES, SIZE_KEYS, addDays, formatDeliveryDate, formatTime, orderLoad, santiagoParts, slotLabel, whatsappLink, type DeliverySlot, type Vehicle } from "@/lib/delivery";
import { getDeliverySettings } from "@/lib/routing/planner";
import { PICKUP_FIELDS, signedPaths, type PickupRow } from "@/lib/routing/operations";
import { brand } from "@/brand";
import { acceptRequest, cancelPickup, movePickup, rejectRequest } from "@/app/reparto/retiros/actions";
import { PickupForm, PlanMineForm } from "./PickupForms";
import { RouteMap, type MapRoute, type MapStop } from "@/components/RouteMap";

const STATUS: Record<PickupRow["status"], { tone: StatusTone; label: string }> = {
  solicitado: { tone: "warn", label: "Por revisar" },
  rechazado: { tone: "off", label: "Rechazado" },
  pendiente: { tone: "off", label: "Pendiente" },
  retirado: { tone: "ok", label: "Retirado" },
  fallido: { tone: "bad", label: "No se pudo" },
  cancelado: { tone: "off", label: "Cancelado" },
};

/**
 * Retiros: direcciones de quienes regalan cosas. Se planifican solos (ruta del
 * chofer) o junto con las entregas del día en "Rutas del día".
 */
export async function PickupsBoard({ fecha, tabs, driverMode, canReview }: { fecha?: string; tabs?: ReactNode; driverMode: boolean; canReview: boolean }) {
  const db = createAdminClient();
  const probe = await db.from("pickups").select("id").limit(1);
  if (probe.error) {
    return (
      <div className="space-y-6">
        {tabs}
        <p className="rounded-2xl bg-brand-soft p-4 text-sm font-bold">
          Falta la tabla de retiros. En Supabase, abre SQL Editor y corre 20261116160000_retiros.sql.
        </p>
      </div>
    );
  }

  const settings = await getDeliverySettings(db, null);
  const today = santiagoParts(new Date()).date;
  const selected = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : today;
  const days = Array.from({ length: 8 }, (_, i) => addDays(today, i));
  if (!days.includes(selected)) days.unshift(selected);

  const [{ data: rows }, { data: counts }, { data: vehiclesData }, { data: stopsData }, { data: requestsData }] = await Promise.all([
    db.from("pickups").select(PICKUP_FIELDS).eq("pickup_date", selected).neq("status", "cancelado").order("created_at"),
    db.from("pickups").select("pickup_date").in("pickup_date", days).neq("status", "cancelado"),
    db.from("vehicles").select("*").is("seller_id", null).eq("active", true).order("created_at"),
    db.from("route_stops").select("id, pickup_id, seq, eta, route_id, delivery_routes!inner(status, color, delivery_date)").not("pickup_id", "is", null).eq("delivery_routes.delivery_date", selected),
    canReview
      ? db.from("pickups").select(`${PICKUP_FIELDS}, contact_email, request_photos, created_at`).eq("status", "solicitado").order("created_at").limit(30)
      : Promise.resolve({ data: [] }),
  ]);
  // Solicitudes que llegaron desde la web (con fotos) esperando respuesta
  const requests = await Promise.all(
    ((requestsData ?? []) as unknown as (PickupRow & { contact_email: string | null; request_photos: string[]; created_at: string })[]).map(async (r) => ({
      ...r,
      photos: (await signedPaths(db, r.request_photos)).filter(Boolean) as string[],
    })),
  );
  const pickups = (rows ?? []) as unknown as PickupRow[];
  const vehicles = (vehiclesData ?? []) as Vehicle[];
  const perDay = new Map<string, number>();
  for (const c of counts ?? []) perDay.set(c.pickup_date as string, (perDay.get(c.pickup_date as string) ?? 0) + 1);
  const stopOf = new Map(
    ((stopsData ?? []) as unknown as { id: string; pickup_id: string; seq: number; eta: string | null; route_id: string; delivery_routes: { status: string; color: string } }[]).map((s) => [s.pickup_id, s]),
  );
  const open = pickups.filter((p) => p.status === "pendiente" || p.status === "fallido");
  const withoutRoute = open.filter((p) => !stopOf.has(p.id));
  const load = open.reduce((a, p) => {
    const l = orderLoad(p);
    return { kg: a.kg + l.kg, m3: a.m3 + l.m3 };
  }, { kg: 0, m3: 0 });
  // Mapa del día: retiros con ruta en su orden y color; los sin ruta, en gris y sin línea
  const mapPoints = pickups.filter((p) => p.lat != null && p.lng != null && p.status !== "rechazado" && p.status !== "solicitado");
  const byRoute = new Map<string, { color: string; stops: MapStop[] }>();
  const loose: MapStop[] = [];
  mapPoints.forEach((p, i) => {
    const st = stopOf.get(p.id);
    const stop: MapStop = { lat: p.lat!, lng: p.lng!, seq: st?.seq ?? i + 1, title: `${p.items} · ${p.comuna ?? ""}`, status: p.status === "retirado" ? "entregado" : p.status };
    if (!st) return void loose.push(stop);
    const r = byRoute.get(st.route_id) ?? { color: st.delivery_routes.color, stops: [] };
    r.stops.push(stop);
    byRoute.set(st.route_id, r);
  });
  const mapRoutes: MapRoute[] = [
    ...[...byRoute].map(([id, r]) => ({ id, color: r.color, stops: r.stops.sort((a, b) => a.seq - b.seq) })),
    ...(loose.length ? [{ id: "sin-ruta", color: "#8a8a8a", stops: loose, noLine: true }] : []),
  ];
  const slots = (["cualquiera", "manana", "tarde"] as DeliverySlot[]).map((v) => ({ value: v, label: slotLabel(v, settings) }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {tabs}
      <div>
        <h1 className="text-2xl font-black">Retiros</h1>
        <p className="text-muted">Anota dónde hay que ir a buscar lo que regalan. La ruta se arma sola, por cercanía, tráfico y espacio en el vehículo.</p>
      </div>

      <nav className="flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => (
          <Link key={d} href={`?fecha=${d}`} className={`shrink-0 rounded-2xl border-2 px-4 py-2 text-left ${d === selected ? "border-foreground bg-surface" : "border-border"}`}>
            <span className="block text-xs font-bold uppercase text-muted">{d === today ? "Hoy" : formatDeliveryDate(d, { weekday: "short" })}</span>
            <span className="block font-extrabold">{formatDeliveryDate(d, { day: "numeric", month: "short" })}</span>
            <span className="block text-xs text-muted">{perDay.get(d) ? `${perDay.get(d)} retiro${perDay.get(d) === 1 ? "" : "s"}` : "—"}</span>
          </Link>
        ))}
      </nav>

      {requests.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-brand px-2 text-xs font-black text-white">{requests.length}</span>
            Solicitudes desde la web
          </h2>
          <p className="text-sm text-muted">Personas que piden que pasemos a buscar algo. Acepta con un día y entra a las rutas, o recházala.</p>
          <ul className="space-y-3">
            {requests.map((r) => {
              const first = r.contact_name.split(" ")[0];
              const waYes = whatsappLink(r.contact_phone, `Hola ${first}, te escribimos de ${brand.name}. ¡Sí podemos retirar ${r.items}! Te confirmamos el día por aquí.`);
              const waNo = whatsappLink(r.contact_phone, `Hola ${first}, te escribimos de ${brand.name}. Gracias por escribirnos; esta vez no podremos retirar ${r.items}.`);
              return (
                <li key={r.id} className="space-y-3 rounded-2xl border-2 border-foreground bg-card p-4">
                  <div className="flex gap-2 overflow-x-auto">
                    {r.photos.map((src, i) => (
                      <a key={i} href={src} target="_blank" rel="noreferrer" className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={`Foto ${i + 1}`} className="h-28 w-28 rounded-xl object-cover" />
                      </a>
                    ))}
                  </div>
                  <div className="text-sm">
                    <p className="font-extrabold">{r.items}</p>
                    <p>{r.address}{r.comuna ? `, ${r.comuna}` : ""}{r.address_notes ? ` · ${r.address_notes}` : ""}</p>
                    <p className="text-muted">
                      {r.contact_name} · {r.contact_phone}{r.contact_email ? ` · ${r.contact_email}` : ""} · prefiere {slotLabel(r.slot as DeliverySlot, settings).split(" (")[0].toLowerCase()} · llegó {new Date(r.created_at).toLocaleDateString("es-CL", { timeZone: "America/Santiago", day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <form action={acceptRequest} className="flex flex-wrap items-center gap-2 text-sm">
                    <input type="hidden" name="id" value={r.id} />
                    <select name="pickup_date" defaultValue={days[1] ?? today} className="rounded-xl border border-border bg-background px-2 py-2" aria-label="Día del retiro">
                      {days.map((d) => <option key={d} value={d}>{d === today ? "Hoy" : formatDeliveryDate(d, { weekday: "short", day: "numeric", month: "short" })}</option>)}
                    </select>
                    <select name="size" defaultValue="" className="rounded-xl border border-border bg-background px-2 py-2" aria-label="Tamaño">
                      <option value="">Tamaño: mediano</option>
                      {SIZE_KEYS.map((k) => <option key={k} value={k}>{SIZES[k].label}</option>)}
                    </select>
                    <input name="volume_m3" inputMode="decimal" placeholder="m³ (opcional)" className="w-28 rounded-xl border border-border bg-background px-2 py-2" />
                    <button className="rounded-full bg-brand px-4 py-2 font-extrabold text-white">Aceptar</button>
                    {waYes && <a href={waYes} target="_blank" rel="noreferrer" className="font-bold text-accent">Avisar por WhatsApp</a>}
                  </form>
                  <form action={rejectRequest} className="flex flex-wrap items-center gap-2 text-sm">
                    <input type="hidden" name="id" value={r.id} />
                    <input name="note" placeholder="Motivo (solo para el equipo)" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2" />
                    <button className="rounded-full border border-border px-4 py-2 font-bold">Rechazar</button>
                    {waNo && <a href={waNo} target="_blank" rel="noreferrer" className="font-bold text-muted">Avisar que no</a>}
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <PickupForm
          date={selected}
          comunas={COMUNAS}
          slots={slots}
          sizes={SIZE_KEYS.map((k) => ({ value: k, label: `${SIZES[k].label}: ${SIZES[k].hint}` }))}
        />

        <div className="space-y-4">
          <section className="grid grid-cols-3 gap-2">
            <Stat label="Por retirar" value={String(open.length)} />
            <Stat label="Volumen" value={`${load.m3.toFixed(1)} m³`} />
            <Stat label="Peso" value={`${Math.round(load.kg)} kg`} />
          </section>

          {mapPoints.length > 0 && (
            <RouteMap
              className="h-72"
              depot={settings.depot_lat != null && settings.depot_lng != null ? { lat: settings.depot_lat, lng: settings.depot_lng } : null}
              routes={mapRoutes}
            />
          )}

          {driverMode && (
            <PlanMineForm
              date={selected}
              pending={withoutRoute.length}
              vehicles={vehicles.map((v) => ({ id: v.id, label: `${v.name} · ${Number(v.capacity_m3)} m³` }))}
            />
          )}
          {tabs && (
            <p className="rounded-2xl bg-surface p-4 text-sm">
              Para combinarlos con las entregas del día, planifica en{" "}
              <Link href={`/admin/despacho/rutas?fecha=${selected}`} className="font-bold underline">Rutas del día</Link>: el sistema decide si conviene que el mismo vehículo entregue y retire.
            </p>
          )}

          {pickups.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center text-muted">
              <Icon name="boxOpen" className="mx-auto h-10 w-10" strokeWidth={1.4} />
              <p className="mt-2">No hay retiros para este día.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {pickups.map((p) => {
                const stop = stopOf.get(p.id);
                const routeOpen = !stop || (stop.delivery_routes.status !== "en_curso" && stop.delivery_routes.status !== "terminada");
                const wa = whatsappLink(p.contact_phone, `Hola ${p.contact_name.split(" ")[0]}, te escribimos de ${brand.name} por el retiro de ${p.items} el ${formatDeliveryDate(selected)}.`);
                return (
                  <li key={p.id} className="space-y-1.5 p-3 text-sm">
                    <div className="flex items-start gap-3">
                      {stop ? (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black text-white" style={{ background: stop.delivery_routes.color }}>{stop.seq}</span>
                      ) : (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-border" title="Sin ruta" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{p.items}</p>
                        <p className="text-muted">{p.contact_name} · {p.address}{p.comuna ? `, ${p.comuna}` : ""}</p>
                        <p className="text-xs text-muted">
                          {SIZES[orderLoad(p).size].label} · {slotLabel(p.slot as DeliverySlot, settings).split(" (")[0]}
                          {stop?.eta && p.status === "pendiente" ? ` · llegada ${formatTime(stop.eta)}` : ""}
                          {!stop && (p.status === "pendiente" || p.status === "fallido") ? " · sin ruta" : ""}
                        </p>
                      </div>
                      <StatusDot {...STATUS[p.status]} />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pl-10 text-xs font-bold">
                      {stop && <Link href={`/reparto/parada/${stop.id}`} className="text-brand">{p.status === "retirado" ? `Ver fotos y firma (${p.photo_paths.length})` : "Abrir parada"}</Link>}
                      {wa && p.status !== "retirado" && <a href={wa} target="_blank" rel="noreferrer" className="text-accent">WhatsApp</a>}
                      {p.status !== "retirado" && routeOpen && (
                        <>
                          <form action={movePickup} className="flex items-center gap-1">
                            <input type="hidden" name="id" value={p.id} />
                            <select name="to" defaultValue="" className="rounded-lg border border-border bg-background px-1.5 py-1">
                              <option value="" disabled>Cambiar día…</option>
                              {days.filter((d) => d !== selected).map((d) => <option key={d} value={d}>{formatDeliveryDate(d, { weekday: "short", day: "numeric", month: "short" })}</option>)}
                            </select>
                            <button className="text-muted hover:text-foreground">Mover</button>
                          </form>
                          <form action={cancelPickup}>
                            <input type="hidden" name="id" value={p.id} />
                            <button className="text-muted hover:text-pass">Quitar</button>
                          </form>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <p className="text-xl font-black">{value}</p>
    </div>
  );
}
