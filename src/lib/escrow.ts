import type { Order } from "./types";
import type { StatusTone } from "@/components/StatusDot";

/** En qué va el dinero de una venta de un vendedor. */
export type PayoutState = "por_pagar" | "por_entregar" | "en_revision" | "con_reclamo" | "liberado" | "transferido" | "reembolsado";

export function payoutState(o: Order, now = Date.now()): PayoutState {
  if (o.status === "refunded" || o.refunded_at) return "reembolsado";
  if (o.status !== "paid") return "por_pagar";
  if (o.payout_at) return "transferido";
  if (o.released_at) return "liberado";
  if (o.issue_at) return "con_reclamo";
  if (o.release_at && new Date(o.release_at).getTime() <= now) return "liberado";
  if (o.delivered_at) return "en_revision";
  return "por_entregar";
}

export const PAYOUT_LABEL: Record<PayoutState, { tone: StatusTone; label: string }> = {
  por_pagar: { tone: "off", label: "Sin pagar" },
  por_entregar: { tone: "warn", label: "Por entregar" },
  en_revision: { tone: "info", label: "En revisión del comprador" },
  con_reclamo: { tone: "bad", label: "Con reclamo" },
  liberado: { tone: "ok", label: "Liberado, por transferir" },
  transferido: { tone: "ok", label: "Transferido" },
  reembolsado: { tone: "off", label: "Reembolsado" },
};

/** Lo que le corresponde al vendedor (venta menos comisión). */
export function sellerNet(o: Pick<Order, "amount" | "commission_amount">) {
  return Math.max(0, o.amount - (o.commission_amount ?? 0));
}
