import type { Metadata } from "next";
import Link from "next/link";
import { hasSupabaseEnv } from "@/lib/env";
import { requireSection } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { SetupNotice } from "@/components/SetupNotice";
import { Icon } from "@/components/Icon";
import { MOVE_WHEN, MOVING_STEPS } from "@/lib/moving-leads";
import { MudanzasTabs } from "../Tabs";
import { LeadForm, SettingsForm, type LeadSettings } from "./Forms";

export const metadata: Metadata = { title: "Posibles mudanzas" };

type Lead = {
  user_id: string;
  score: number;
  reasons: string[];
  answer: "si" | "no" | "despues" | null;
  answered_at: string | null;
  move_when: string | null;
  step: number;
  contact_ok: boolean;
  contact_name: string | null;
  contact_phone: string | null;
  team_status: string;
  team_note: string | null;
  known_name: string | null;
  known_email: string | null;
  comuna: string | null;
  has_booking: boolean;
  last_activity: string | null;
};

const DEFAULTS: LeadSettings = {
  enabled: true,
  threshold: 40,
  window_days: 30,
  ask_again_no_days: 120,
  ask_again_later_days: 10,
  reminder_offer: "",
};

const FILTERS = [
  { key: "calientes", label: "Calientes" },
  { key: "si", label: "Dijeron que sí" },
  { key: "todos", label: "Todos" },
] as const;

const ANSWER: Record<string, { label: string; cls: string }> = {
  si: { label: "Dijo que sí", cls: "bg-accent/15 text-accent" },
  no: { label: "Dijo que no", cls: "bg-surface text-muted" },
  despues: { label: "Más adelante", cls: "bg-brand-soft" },
};

function when(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function waLink(phone: string, name: string | null) {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 9 && digits.startsWith("9")) digits = `56${digits}`;
  const text = `Hola${name ? ` ${name.split(" ")[0]}` : ""}, te escribimos de MUVEO porque nos contaste que te cambias de casa. ¿Te ayudamos a cotizar tu mudanza?`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export default async function PosiblesMudanzasPage({ searchParams }: PageProps<"/admin/mudanzas/posibles">) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireSection("mudanzas");
  const sp = await searchParams;
  const filter = FILTERS.some((f) => f.key === sp.ver) ? (sp.ver as string) : "calientes";

  const db = createAdminClient();
  const [{ data: cfg, error: cfgError }, { data, error }] = await Promise.all([
    db.from("moving_lead_settings").select("*").eq("id", 1).maybeSingle(),
    db.rpc("admin_moving_leads", { p_min_score: 15, p_limit: 300 }),
  ]);
  const settings: LeadSettings = { ...DEFAULTS, ...((cfg as Partial<LeadSettings> | null) ?? {}) };
  const all = (data ?? []) as Lead[];
  const leads = all.filter((l) =>
    filter === "si" ? l.answer === "si" : filter === "calientes" ? l.answer === "si" || (l.score >= settings.threshold && l.answer !== "no") : true,
  );
  const missing = Boolean(cfgError || error);

  return (
    <div className="space-y-8">
      <MudanzasTabs active="/admin/mudanzas/posibles" />
      <div className="space-y-1">
        <h1 className="text-2xl font-black">Posibles mudanzas</h1>
        <p className="text-muted">
          Personas que, por lo que miran, buscan y compran, parece que se cambian de casa. Es una estimación. A quien pasa el puntaje se le
          pregunta &quot;¿Te cambias de casa?&quot; y, si dice que sí, cada visita le muestra un consejo nuevo: cotizar, retiro gratis, créditos y
          un recordatorio para reservar.
        </p>
      </div>

      {missing && (
        <p className="rounded-2xl bg-brand-soft p-4 text-sm font-bold">
          Falta correr la migración 20261119120000_posibles_mudanzas.sql en Supabase (SQL Editor).
        </p>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`/admin/mudanzas/posibles?ver=${f.key}`}
              className={`rounded-full px-4 py-2 text-sm font-bold ${filter === f.key ? "bg-foreground text-background" : "bg-surface text-muted hover:text-foreground"}`}
            >
              {f.label}
              <span className="ml-1.5 opacity-70">
                {f.key === "todos"
                  ? all.length
                  : f.key === "si"
                    ? all.filter((l) => l.answer === "si").length
                    : all.filter((l) => l.answer === "si" || (l.score >= settings.threshold && l.answer !== "no")).length}
              </span>
            </Link>
          ))}
        </div>

        {leads.length === 0 ? (
          <p className="rounded-2xl bg-surface p-6 text-muted">Todavía no hay nadie en esta lista.</p>
        ) : (
          <ul className="space-y-3">
            {leads.map((l) => {
              const name = l.contact_name || l.known_name;
              const ans = l.answer ? ANSWER[l.answer] : null;
              const moveWhen = MOVE_WHEN.find((w) => w.key === l.move_when)?.label;
              return (
                <li key={l.user_id} className="space-y-3 rounded-2xl border border-border bg-card p-4 md:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="font-black">{name || "Visitante sin nombre"}</p>
                      <p className="text-sm text-muted">
                        {[l.known_email, l.comuna, l.last_activity && `Última actividad: ${when(l.last_activity)}`].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="w-36 shrink-0 text-right">
                      <p className="text-sm font-black">{l.score} / 100</p>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface">
                        <div className="h-full rounded-full bg-gradient-to-r from-brand via-brand-2 to-accent" style={{ width: `${Math.max(4, l.score)}%` }} />
                      </div>
                    </div>
                  </div>

                  {l.reasons.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {l.reasons.map((r) => (
                        <li key={r} className="rounded-full bg-surface px-3 py-1 text-xs font-semibold">
                          {r}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {ans ? (
                      <span className={`rounded-full px-3 py-1 font-bold ${ans.cls}`}>
                        {ans.label}
                        {l.answered_at && <span className="font-normal"> · {when(l.answered_at)}</span>}
                      </span>
                    ) : (
                      <span className="rounded-full bg-surface px-3 py-1 font-bold text-muted">Aún no se le pregunta</span>
                    )}
                    {moveWhen && (
                      <span className="flex items-center gap-1 rounded-full bg-surface px-3 py-1 font-bold">
                        <Icon name="calendar" className="h-4 w-4" />
                        {moveWhen}
                      </span>
                    )}
                    {l.answer === "si" && (
                      <span className="rounded-full bg-surface px-3 py-1 font-bold">
                        {l.step >= 5 ? "Vio todos los consejos" : `Consejo ${Math.max(1, l.step)} de ${MOVING_STEPS.length}`}
                      </span>
                    )}
                    {l.has_booking && (
                      <span className="flex items-center gap-1 rounded-full bg-accent/15 px-3 py-1 font-bold text-accent">
                        <Icon name="truck" className="h-4 w-4" />
                        Tiene mudanza reservada
                      </span>
                    )}
                  </div>

                  {l.contact_ok && l.contact_phone ? (
                    <a
                      href={waLink(l.contact_phone, name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border-2 border-foreground px-4 py-2 text-sm font-bold hover:bg-surface"
                    >
                      <Icon name="chat" className="h-4 w-4" />
                      Escribir por WhatsApp · {l.contact_phone}
                    </a>
                  ) : (
                    <p className="text-xs text-muted">No autorizó que le escribamos: solo ve los consejos en la web.</p>
                  )}

                  <LeadForm userId={l.user_id} status={l.team_status} note={l.team_note} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-6">
        <h2 className="flex items-center gap-2 text-lg font-black">
          <Icon name="calculator" className="h-5 w-5" />
          Cómo se calcula y ajustes
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Mira, le gustan o comparte muebles, electro, dormitorio, cocina o cosas grandes: 3 puntos cada una (máx. 30). Cinco o más en una semana: +10.</li>
          <li>Compró cosas para la casa: 8 puntos cada una (máx. 24).</li>
          <li>Buscó palabras como mudanza, cajas, embalaje o casa nueva: hasta 12.</li>
          <li>Pidió despacho a otra comuna que la de su perfil, o a varias: 15.</li>
          <li>En su perfil dice primer depa, casa nueva o algo más chico: 20.</li>
          <li>Entró a mudanzas (10), Conócenos (8), cotizador (20), retiros (8), pidió retiro (15) o reservó (40), por día. Máx. 50.</li>
        </ul>
        <SettingsForm settings={settings} />
      </section>
    </div>
  );
}
