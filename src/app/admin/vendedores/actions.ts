"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { refundOrder } from "@/lib/payments";
import type { SellerStatus } from "@/lib/types";

export type AdminSellerState = { ok?: string; error?: string };

const uuid = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "");
  return /^[0-9a-f-]{36}$/i.test(s) ? s : null;
};

function done(msg: string): AdminSellerState {
  revalidatePath("/admin/vendedores");
  revalidatePath("/admin/pedidos");
  return { ok: msg };
}

/** Comisión general y días de revisión. */
export async function updateSettings(_prev: AdminSellerState, formData: FormData): Promise<AdminSellerState> {
  await requireAdmin();
  const pct = Number(String(formData.get("commission_pct") ?? "").replace(",", "."));
  const days = parseInt(String(formData.get("review_days") ?? ""), 10);
  if (!Number.isFinite(pct) || pct < 0 || pct > 50) return { error: "La comisión debe estar entre 0 y 50%." };
  if (!Number.isFinite(days) || days < 1 || days > 30) return { error: "Los días de revisión deben estar entre 1 y 30." };
  const { error } = await createAdminClient()
    .from("marketplace_settings")
    .upsert({ id: 1, commission_pct: pct, review_days: days, updated_at: new Date().toISOString() });
  if (error) return { error: "No se pudo guardar." };
  return done("Configuración guardada.");
}

/** Enciende o apaga el marketplace. Apagado: solo vende Totomuves. */
export async function setMarketplaceEnabled(_prev: AdminSellerState, formData: FormData): Promise<AdminSellerState> {
  await requireAdmin();
  const on = formData.get("enabled") === "1";
  const { error } = await createAdminClient()
    .from("marketplace_settings")
    .update({ marketplace_enabled: on, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { error: "No se pudo cambiar. ¿Corriste la migración 20261114050000_interruptor_marketplace.sql?" };
  revalidatePath("/", "layout");
  return { ok: on ? "Marketplace encendido: los vendedores aprobados ya pueden vender." : "Marketplace apagado: solo vende Totomuves." };
}

/** Aprobar, rechazar, suspender o reactivar un vendedor; y su comisión propia. */
export async function updateSeller(_prev: AdminSellerState, formData: FormData): Promise<AdminSellerState> {
  await requireAdmin();
  const id = uuid(formData.get("sellerId"));
  if (!id) return { error: "Vendedor inválido." };
  const status = String(formData.get("status") ?? "") as SellerStatus;
  const note = String(formData.get("admin_note") ?? "").trim().slice(0, 500) || null;
  const pctRaw = String(formData.get("commission_pct") ?? "").trim().replace(",", ".");
  const pct = pctRaw === "" ? null : Number(pctRaw);
  if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 50)) return { error: "La comisión debe estar entre 0 y 50%." };
  if (!["pending", "approved", "rejected", "suspended"].includes(status)) return { error: "Estado inválido." };

  const db = createAdminClient();
  const { data: current } = await db.from("sellers").select("status, approved_at").eq("id", id).maybeSingle();
  if (!current) return { error: "No existe ese vendedor." };
  const { error } = await db
    .from("sellers")
    .update({
      status,
      admin_note: note,
      commission_pct: pct,
      approved_at: status === "approved" ? (current.approved_at ?? new Date().toISOString()) : current.approved_at,
    })
    .eq("id", id);
  if (error) return { error: "No se pudo guardar." };
  return done("Vendedor actualizado.");
}

/** Marca como transferidas todas las ventas liberadas de un vendedor. */
export async function markPaidOut(_prev: AdminSellerState, formData: FormData): Promise<AdminSellerState> {
  await requireAdmin();
  const id = uuid(formData.get("sellerId"));
  if (!id) return { error: "Vendedor inválido." };
  const db = createAdminClient();
  await db.rpc("release_due_orders");
  const { data, error } = await db
    .from("orders")
    .update({ payout_at: new Date().toISOString() })
    .eq("seller_id", id)
    .eq("status", "paid")
    .not("released_at", "is", null)
    .is("payout_at", null)
    .select("id");
  if (error) return { error: "No se pudo marcar." };
  return done(`Listo: ${data?.length ?? 0} venta(s) marcadas como transferidas.`);
}

/** Resolver un reclamo: liberar el pago al vendedor o devolverle el dinero al comprador. */
export async function resolveIssue(_prev: AdminSellerState, formData: FormData): Promise<AdminSellerState> {
  await requireAdmin();
  const id = uuid(formData.get("orderId"));
  if (!id) return { error: "Pedido inválido." };
  if (formData.get("decision") === "refund") {
    try {
      const res = await refundOrder(id);
      if ("error" in res) return { error: res.error };
    } catch (e) {
      console.error("[reembolso]", e);
      return { error: "Mercado Pago no aceptó la devolución. Revisa el pago en tu panel de Mercado Pago." };
    }
    return done("Dinero devuelto al comprador y stock repuesto.");
  }
  const { error } = await createAdminClient()
    .from("orders")
    .update({ released_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "paid")
    .is("released_at", null);
  if (error) return { error: "No se pudo liberar." };
  return done("Pago liberado al vendedor.");
}
