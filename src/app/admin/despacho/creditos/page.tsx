import type { Metadata } from "next";
import { hasSupabaseEnv, siteUrl } from "@/lib/env";
import { requireSection } from "@/lib/admin";
import { SetupNotice } from "@/components/SetupNotice";
import { StatusDot, type StatusTone } from "@/components/StatusDot";
import { ConfirmForm } from "@/components/ConfirmForm";
import { createAdminClient } from "@/lib/supabase/admin";
import { CREDIT_FIELDS, formatCreditCode, formatCreditDate, type StoreCredit } from "@/lib/credits";
import { formatCLP } from "@/lib/format";
import { whatsappLink } from "@/lib/delivery";
import { brand } from "@/brand";
import { DespachoTabs } from "../Tabs";
import { CreditSettingsForm } from "./SettingsForm";
import { annulCredit, extendCredit } from "./actions";

export const metadata: Metadata = { title: "Créditos" };

type Row = StoreCredit & { pickups: { items: string } | null };

export default async function CreditosAdminPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireSection("despacho");
  const tabs = <DespachoTabs active="/admin/despacho/creditos" />;
  const db = createAdminClient();

  const [{ data: settings, error }, { data: rows }] = await Promise.all([
    db.from("credit_settings").select("enabled, expiry_days").eq("id", 1).maybeSingle(),
    db.from("store_credits").select(`${CREDIT_FIELDS}, pickups(items)`).order("created_at", { ascending: false }).limit(200),
  ]);
  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {tabs}
        <p className="rounded-2xl bg-brand-soft p-4 text-sm font-bold">
          Falta la tabla de créditos. En Supabase, abre SQL Editor y corre 20261118110000_creditos_retiros.sql.
        </p>
      </div>
    );
  }
  const credits = (rows ?? []) as unknown as Row[];

  const { used, now } = await usage(db, credits.map((c) => c.id));

  const stateOf = (c: Row): { tone: StatusTone; label: string } => {
    if (c.status === "anulado") return { tone: "off", label: "Anulado" };
    if (c.status === "pendiente") return { tone: "warn", label: "Se activa al retirar" };
    if (c.expires_at && new Date(c.expires_at).getTime() <= now) return { tone: "off", label: "Vencido" };
    if ((used.get(c.id) ?? 0) >= c.amount) return { tone: "off", label: "Usado" };
    return { tone: "ok", label: "Activo" };
  };
  const live = credits.filter((c) => stateOf(c).tone === "ok");
  const owed = live.reduce((a, c) => a + c.amount - (used.get(c.id) ?? 0), 0);
  const pending = credits.filter((c) => c.status === "pendiente").reduce((a, c) => a + c.amount, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {tabs}
      <div>
        <h1 className="text-2xl font-black">Créditos por retiros</h1>
        <p className="text-muted">
          Quien nos entrega cosas recibe créditos para comprar en la tienda. Se dan en Retiros, después de revisar las fotos,
          y se activan cuando el chofer hace el retiro. Pagan productos de {brand.name}, nunca el despacho.
        </p>
      </div>

      <section className="grid grid-cols-3 gap-2">
        <Stat label="Activos" value={String(live.length)} />
        <Stat label="Saldo por usar" value={formatCLP(owed)} />
        <Stat label="Por activar" value={formatCLP(pending)} />
      </section>

      <CreditSettingsForm enabled={settings?.enabled ?? true} expiryDays={settings?.expiry_days ?? 180} />

      {credits.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-border p-8 text-center text-muted">
          Aún no hay créditos. Dalos desde Retiros, al aceptar una solicitud o en cada retiro.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {credits.map((c) => {
            const st = stateOf(c);
            const left = Math.max(0, c.amount - (used.get(c.id) ?? 0));
            const wa =
              st.tone === "ok"
                ? whatsappLink(
                    c.holder_phone,
                    `Hola ${c.holder_name.split(" ")[0]}, te recordamos que tienes ${formatCLP(left)} en créditos para comprar en ${brand.name}. Tu código es ${formatCreditCode(c.code)}${c.expires_at ? ` y vence el ${formatCreditDate(c.expires_at)}` : ""}. Úsalo en ${siteUrl()}/carrito eligiendo despacho.`,
                  )
                : null;
            return (
              <li key={c.id} className="space-y-1.5 p-3 text-sm">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">
                      {c.holder_name} · {formatCLP(c.amount)}
                      {left !== c.amount && c.status === "activo" ? <span className="font-semibold text-muted"> (quedan {formatCLP(left)})</span> : null}
                    </p>
                    <p className="text-muted">
                      <span className="font-mono font-bold text-foreground">{formatCreditCode(c.code)}</span>
                      {c.pickups?.items ? ` · por ${c.pickups.items}` : ""}
                    </p>
                    <p className="text-xs text-muted">
                      {c.expires_at ? `Vence el ${formatCreditDate(c.expires_at)}` : `Creado el ${formatCreditDate(c.created_at)}`}
                      {c.holder_phone ? ` · ${c.holder_phone}` : ""}
                    </p>
                  </div>
                  <StatusDot {...st} />
                </div>
                {c.status !== "anulado" && (
                  <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
                    {wa && <a href={wa} target="_blank" rel="noreferrer" className="text-accent">Enviar código por WhatsApp</a>}
                    {c.status === "activo" && (
                      <form action={extendCredit} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={c.id} />
                        <select name="days" defaultValue="30" className="rounded-lg border border-border bg-background px-1.5 py-1" aria-label="Días">
                          <option value="30">30 días</option>
                          <option value="90">90 días</option>
                          <option value="180">180 días</option>
                        </select>
                        <button className="text-muted hover:text-foreground">Alargar</button>
                      </form>
                    )}
                    <ConfirmForm action={annulCredit} hidden={{ id: c.id }} message={`¿Anular el código de ${c.holder_name}? Ya no podrá usarlo.`}>
                      <button className="text-pass">Anular</button>
                    </ConfirmForm>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Lo usado en compras pagadas (o en pago ahora mismo) de cada crédito. */
async function usage(db: ReturnType<typeof createAdminClient>, ids: string[]) {
  const now = Date.now();
  const used = new Map<string, number>();
  if (!ids.length) return { used, now };
  const { data: uses } = await db.from("store_credit_uses").select("credit_id, amount, checkouts(status, reserved_until)").in("credit_id", ids);
  for (const u of (uses ?? []) as unknown as { credit_id: string; amount: number; checkouts: { status: string; reserved_until: string | null } | null }[]) {
    const c = u.checkouts;
    const counts = c && (c.status === "paid" || (c.status === "pending" && c.reserved_until && new Date(c.reserved_until).getTime() > now));
    if (counts) used.set(u.credit_id, (used.get(u.credit_id) ?? 0) + u.amount);
  }
  return { used, now };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <p className="text-xl font-black">{value}</p>
    </div>
  );
}
