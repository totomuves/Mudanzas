import type { Metadata } from "next";
import Link from "next/link";
import { hasSupabaseEnv } from "@/lib/env";
import { requireSection } from "@/lib/admin";
import { formatCLP } from "@/lib/format";
import { payoutState, sellerNet } from "@/lib/escrow";
import { SELLER_STATUS_LABEL } from "@/lib/seller";
import { SetupNotice } from "@/components/SetupNotice";
import { StatusDot, type StatusTone } from "@/components/StatusDot";
import type { MarketplaceSettings, Order, Product, Seller } from "@/lib/types";
import { IssueButtons, MarketplaceSwitch, PayoutButton, SellerAdminForm, SettingsForm } from "./Forms";

export const metadata: Metadata = { title: "Vendedores" };

const TONE: Record<Seller["status"], StatusTone> = { pending: "warn", approved: "ok", rejected: "off", suspended: "bad" };
const ORDER_RANK: Record<Seller["status"], number> = { pending: 0, approved: 1, suspended: 2, rejected: 3 };
const ACCOUNT_LABEL = { corriente: "Cuenta corriente", vista: "Cuenta vista", ahorro: "Cuenta de ahorro", rut: "CuentaRUT" };

type SellerOrder = Order & { products: Pick<Product, "title"> | null };

export default async function AdminVendedoresPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { supabase } = await requireSection("vendedores");
  await supabase.rpc("release_due_orders");
  const [{ data: sellersData }, { data: settings }, { data: ordersData }, { data: productCounts }] = await Promise.all([
    supabase.from("sellers").select("*").order("created_at", { ascending: false }),
    supabase.from("marketplace_settings").select("*").eq("id", 1).maybeSingle(),
    supabase
      .from("orders")
      .select("*, products(title)")
      .not("seller_id", "is", null)
      .in("status", ["paid", "refunded"])
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("products").select("seller_id").not("seller_id", "is", null).neq("status", "hidden"),
  ]);
  const sellers = ((sellersData ?? []) as Seller[]).sort((a, b) => ORDER_RANK[a.status] - ORDER_RANK[b.status]);
  const orders = (ordersData ?? []) as SellerOrder[];
  const issues = orders.filter((o) => payoutState(o) === "con_reclamo");
  const nameOf = Object.fromEntries(sellers.map((s) => [s.id, s.name]));
  const productsBySeller: Record<string, number> = {};
  (productCounts ?? []).forEach((p: { seller_id: string }) => (productsBySeller[p.seller_id] = (productsBySeller[p.seller_id] ?? 0) + 1));

  function totals(sellerId: string) {
    const mine = orders.filter((o) => o.seller_id === sellerId);
    const sum = (states: string[], f: (o: SellerOrder) => number) =>
      mine.filter((o) => states.includes(payoutState(o))).reduce((s, o) => s + f(o), 0);
    const live = ["por_entregar", "en_revision", "con_reclamo", "liberado", "transferido"];
    return {
      ventas: sum(live, (o) => o.amount),
      comision: sum(live, (o) => o.commission_amount ?? 0),
      retenido: sum(["por_entregar", "en_revision", "con_reclamo"], sellerNet),
      porTransferir: sum(["liberado"], sellerNet),
    };
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-black">Vendedores</h1>
        <p className="text-sm text-muted">
          Personas y empresas que venden en la tienda. Los clientes nunca ven su nombre: todo se muestra como
          MÜVEO. Tú cobras con tu Mercado Pago, retienes hasta que el comprador revisa y luego les transfieres.
        </p>
      </div>

      <section className="rounded-2xl border-2 border-foreground bg-card p-4">
        <MarketplaceSwitch enabled={Boolean((settings as MarketplaceSettings | null)?.marketplace_enabled)} />
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-black">Configuración</h2>
        <SettingsForm settings={settings as MarketplaceSettings | null} />
      </section>

      {issues.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-black">Reclamos por resolver ({issues.length})</h2>
          {issues.map((o) => (
            <div key={o.id} className="space-y-2 rounded-2xl border-2 border-pass/40 bg-card p-4">
              <p className="font-bold">
                {o.products?.title ?? "Producto"} · {formatCLP(o.amount)} · {nameOf[o.seller_id ?? ""] ?? "Vendedor"}
              </p>
              <p className="text-sm">
                <span className="font-bold">{o.buyer_name}:</span> {o.issue_text}
              </p>
              <p className="text-xs text-muted">
                {o.buyer_email} · {o.buyer_phone} · reclamó el {new Date(o.issue_at!).toLocaleDateString("es-CL")}
              </p>
              <IssueButtons orderId={o.id} />
            </div>
          ))}
        </section>
      )}

      {sellers.length === 0 ? (
        <p className="text-muted">
          Aún no hay vendedores. Comparte el enlace <Link href="/vender" className="font-bold text-brand">/vender</Link> para que se registren.
        </p>
      ) : (
        <section className="space-y-4">
          {sellers.map((s) => {
            const t = totals(s.id);
            return (
              <details key={s.id} open={s.status === "pending" || t.porTransferir > 0} className="group rounded-2xl border border-border bg-card">
                <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface text-sm font-black">
                    {s.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.logo_url} alt="" className="h-full w-full object-contain" />
                    ) : (
                      s.name.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{s.name}</p>
                    <p className="text-xs text-muted">
                      {s.kind === "empresa" ? "Empresa" : "Persona"} · {productsBySeller[s.id] ?? 0} productos · Ventas {formatCLP(t.ventas)}
                      {t.porTransferir > 0 ? ` · Por transferir ${formatCLP(t.porTransferir)}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-bold">
                    <StatusDot tone={TONE[s.status]} label={SELLER_STATUS_LABEL[s.status]} />
                  </span>
                </summary>
                <div className="space-y-5 border-t border-border p-4">
                  <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <Row label="Contacto" value={[s.contact_name, s.email, s.phone].filter(Boolean).join(" · ")} />
                    <Row label="RUT" value={s.rut ?? "—"} />
                    <Row label="Comunas" value={s.comunas.length ? s.comunas.join(", ") : "—"} />
                    <Row label="Registro" value={new Date(s.created_at).toLocaleDateString("es-CL")} />
                    {s.description && <Row label="Descripción" value={s.description} />}
                  </dl>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Mini label="Ventas" value={formatCLP(t.ventas)} />
                    <Mini label="Tu comisión" value={formatCLP(t.comision)} />
                    <Mini label="Retenido" value={formatCLP(t.retenido)} />
                    <Mini label="Por transferir" value={formatCLP(t.porTransferir)} />
                  </div>

                  <div className="rounded-xl bg-surface p-3 text-sm">
                    <p className="font-bold">Cuenta para transferir</p>
                    {s.bank_account_number ? (
                      <p>
                        {s.bank_holder_name} · {s.bank_holder_rut} · {s.bank_name} ·{" "}
                        {s.bank_account_type ? ACCOUNT_LABEL[s.bank_account_type] : ""} {s.bank_account_number}
                      </p>
                    ) : (
                      <p className="text-muted">El vendedor aún no ingresa su cuenta.</p>
                    )}
                  </div>
                  {t.porTransferir > 0 && <PayoutButton sellerId={s.id} label={`Ya le transferí ${formatCLP(t.porTransferir)}`} />}

                  <SellerAdminForm seller={s} />
                </div>
              </details>
            );
          })}
        </section>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted">{label}:</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-[11px] font-bold uppercase text-muted">{label}</p>
      <p className="font-black">{value}</p>
    </div>
  );
}
