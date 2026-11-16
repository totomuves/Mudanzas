import type { Metadata } from "next";
import Link from "next/link";
import { hasSupabaseEnv } from "@/lib/env";
import { SetupNotice } from "@/components/SetupNotice";
import { Icon } from "@/components/Icon";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDriver, type RouteRow } from "@/lib/routing/operations";
import { addDays, formatDeliveryDate, formatTime, santiagoParts } from "@/lib/delivery";

export const metadata: Metadata = { title: "Reparto" };

const LABEL: Record<RouteRow["status"], string> = {
  borrador: "En preparación",
  publicada: "Lista para salir",
  en_curso: "En ruta",
  terminada: "Terminada",
};

export default async function RepartoPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { user, canManage, sellerId } = await requireDriver();
  const db = createAdminClient();
  const today = santiagoParts(new Date()).date;
  let q = db
    .from("delivery_routes")
    .select("*, vehicles(name, plate), route_stops(status)")
    .gte("delivery_date", addDays(today, -3))
    .neq("status", "borrador")
    .order("delivery_date")
    .order("created_at");
  // Despacho ve las rutas de MUVEO; el vendedor, las suyas; el chofer, las asignadas
  const mine = [`driver_id.eq.${user.id}`];
  if (canManage) mine.push("seller_id.is.null");
  if (sellerId) mine.push(`seller_id.eq.${sellerId}`);
  q = q.or(mine.join(","));
  const { data, error } = await q;
  const routes = (data ?? []) as (RouteRow & { vehicles: { name: string; plate: string | null } | null; route_stops: { status: string }[] })[];

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h1 className="text-3xl font-black">Reparto</h1>
        <p className="text-muted">{canManage ? "Todas las rutas publicadas." : sellerId ? "Las rutas de tu tienda." : "Tus rutas asignadas."}</p>
      </div>
      {error && <p className="rounded-2xl bg-brand-soft p-4 text-sm font-bold">Falta correr la migración de rutas en Supabase.</p>}
      {routes.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center text-muted">
          <Icon name="truck" className="mx-auto h-12 w-12" strokeWidth={1.4} />
          <p className="mt-2">No tienes rutas por ahora.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {routes.map((r) => {
            const done = r.route_stops.filter((s) => s.status === "entregado" || s.status === "fallido").length;
            const total = r.route_stops.length;
            return (
              <li key={r.id}>
                <Link href={`/reparto/${r.id}`} className={`block space-y-2 rounded-2xl border border-border bg-card p-4 ${r.delivery_date < today && r.status === "terminada" ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ background: r.color }} />
                    <p className="flex-1 font-extrabold">
                      {r.delivery_date === today ? "Hoy" : formatDeliveryDate(r.delivery_date, { weekday: "long", day: "numeric", month: "short" })}
                    </p>
                    <span className="text-xs font-bold text-muted">{LABEL[r.status]}</span>
                  </div>
                  <p className="text-sm text-muted">
                    {r.vehicles?.name ?? "Vehículo"} · {total} entregas · {(r.planned_distance_m / 1000).toFixed(0)} km · sale {r.planned_start ? formatTime(r.planned_start) : "—"}
                  </p>
                  <div className="h-2 overflow-hidden rounded-full bg-surface">
                    <div className="h-full rounded-full" style={{ width: `${total ? (done / total) * 100 : 0}%`, background: r.color }} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
