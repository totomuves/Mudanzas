import type { Metadata } from "next";
import { hasSupabaseEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/admin";
import { formatCLP } from "@/lib/format";
import { BOOKING_STATUS, DISTANCES, formatDay } from "@/lib/moving";
import { SetupNotice } from "@/components/SetupNotice";
import { blockDay, setBookingStatus, unblockDay } from "./actions";

export const metadata: Metadata = { title: "Agenda de mudanzas" };

type Row = {
  id: string;
  day: string;
  slot_time: string;
  status: string;
  origin_address: string;
  origin_comuna: string;
  origin_floor: number;
  origin_elevator: boolean;
  dest_address: string;
  dest_comuna: string;
  dest_floor: number;
  dest_elevator: boolean;
  distance: string;
  packing: boolean;
  heavy_items: number;
  notes: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  estimated_price: number;
  service_types: { name: string; emoji: string } | null;
};

export default async function AdminMudanzasPage({ searchParams }: PageProps<"/admin/mudanzas">) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const showPast = sp.ver === "todas";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

  let q = supabase.from("bookings").select("*, service_types(name, emoji)").order("day").order("slot_time").limit(300);
  if (!showPast) q = q.gte("day", today);
  const [{ data }, { data: blocked }] = await Promise.all([
    q,
    supabase.from("blocked_dates").select("*").gte("day", today).order("day"),
  ]);
  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-black">Agenda de mudanzas</h1>
        <a href={showPast ? "/admin/mudanzas" : "/admin/mudanzas?ver=todas"} className="text-sm font-bold text-brand">
          {showPast ? "Ver solo próximas" : "Ver también pasadas"}
        </a>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted">No hay reservas.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((b) => {
            const phone = b.contact_phone.replace(/\D/g, "");
            const st = BOOKING_STATUS[b.status];
            return (
              <li key={b.id} className={`rounded-2xl border border-border bg-card p-4 ${b.status === "cancelled" ? "opacity-50" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-extrabold">
                      📅 {formatDay(b.day)} · {b.slot_time} hrs
                    </p>
                    <p className="text-sm">
                      {b.service_types?.emoji} {b.service_types?.name} · <b>{formatCLP(b.estimated_price)}</b>
                    </p>
                  </div>
                  <form action={setBookingStatus} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={b.id} />
                    <select name="status" defaultValue={b.status} className="rounded-lg border border-border bg-background px-2 py-1 text-sm">
                      {Object.entries(BOOKING_STATUS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.icon} {v.label}
                        </option>
                      ))}
                    </select>
                    <button className="rounded-lg bg-foreground px-3 py-1 text-sm font-bold text-background">Guardar</button>
                  </form>
                </div>
                <div className="mt-2 grid gap-1 text-sm text-muted sm:grid-cols-2">
                  <p>📍 {b.origin_address}, {b.origin_comuna} (piso {b.origin_floor}{b.origin_elevator ? ", ascensor" : ""})</p>
                  <p>🏁 {b.dest_address}, {b.dest_comuna} (piso {b.dest_floor}{b.dest_elevator ? ", ascensor" : ""})</p>
                  <p>
                    Distancia: {DISTANCES.find((d) => d.key === b.distance)?.label}
                    {b.packing ? " · 📦 Embalaje" : ""}
                    {b.heavy_items ? ` · 🎹 ${b.heavy_items} pesado(s)` : ""}
                  </p>
                  <p>
                    👤 {b.contact_name} · {b.contact_email} ·{" "}
                    <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" className="font-bold text-accent">
                      WhatsApp
                    </a>
                  </p>
                  {b.notes && <p className="sm:col-span-2">📝 {b.notes}</p>}
                </div>
                <p className="mt-1 text-xs text-muted">{st?.icon} {st?.label} · #{b.id.slice(0, 8)}</p>
              </li>
            );
          })}
        </ul>
      )}

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-extrabold">Días sin atención</h2>
        <form action={blockDay} className="flex flex-wrap gap-2">
          <input type="date" name="day" required min={today} className="rounded-xl border border-border bg-background px-3 py-2" />
          <input name="reason" placeholder="Motivo (opcional)" className="flex-1 rounded-xl border border-border bg-background px-3 py-2" />
          <button className="rounded-xl bg-foreground px-4 py-2 font-bold text-background">Bloquear día</button>
        </form>
        <ul className="flex flex-wrap gap-2">
          {(blocked ?? []).map((d: { day: string; reason: string | null }) => (
            <li key={d.day}>
              <form action={unblockDay} className="flex items-center gap-1 rounded-full bg-background px-3 py-1 text-sm">
                <input type="hidden" name="day" value={d.day} />
                <span>{formatDay(d.day)}{d.reason ? ` · ${d.reason}` : ""}</span>
                <button aria-label="Desbloquear" className="font-black text-pass">×</button>
              </form>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">
          Precios, horarios de los bloques, cupos por bloque y WhatsApp se editan en Supabase → Table Editor →
          <code> moving_settings</code> y <code>service_types</code>.
        </p>
      </section>
    </div>
  );
}
