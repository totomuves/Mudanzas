"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSection } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { orderLoad } from "@/lib/delivery";
import { deliveryDateFor } from "@/lib/routing/planner";
import type { Order } from "@/lib/types";

export type NewOrderState = { error?: string };

/** Marca de los pedidos cargados a mano (no pasan por Mercado Pago). */
const MANUAL = "manual";
const PAYMENTS = { efectivo: "Efectivo", transferencia: "Transferencia", pendiente: "Por pagar" } as const;
/** Un pedido "por pagar" aparta las unidades estos días. */
const HOLD_DAYS = 3;

export async function createManualOrder(_prev: NewOrderState, formData: FormData): Promise<NewOrderState> {
  await requireSection("pedidos");
  const str = (k: string) => String(formData.get(k) ?? "").trim();

  const productId = str("productId");
  const quantity = Math.max(1, Math.min(50, parseInt(str("quantity"), 10) || 1));
  const name = str("name");
  const email = str("email").toLowerCase();
  const phone = str("phone");
  const delivery = str("delivery") === "despacho" ? "despacho" : "retiro";
  const comuna = str("comuna");
  const address = str("address");
  const addressNotes = str("address_notes").slice(0, 200);
  const slotRaw = str("delivery_slot");
  const slot = slotRaw === "manana" || slotRaw === "tarde" ? slotRaw : "cualquiera";
  const dateRaw = str("delivery_date");
  const priceRaw = str("price").replace(/\D/g, "");
  const payment = (str("payment") in PAYMENTS ? str("payment") : "pendiente") as keyof typeof PAYMENTS;

  if (!/^[0-9a-f-]{36}$/i.test(productId)) return { error: "Elige el producto." };
  if (name.length < 2) return { error: "Escribe el nombre del comprador." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Revisa el correo." };
  if (!email && phone.replace(/\D/g, "").length < 8) return { error: "Escribe un correo o un teléfono del comprador." };
  if (delivery === "despacho" && !comuna) return { error: "Elige la comuna de despacho." };
  if (delivery === "despacho" && address.length < 5) return { error: "Escribe la dirección de despacho." };
  if (dateRaw && !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) return { error: "Revisa la fecha de entrega." };

  const db = createAdminClient();
  if (delivery === "despacho") {
    const { data: rate } = await db.from("shipping_rates").select("price").eq("comuna", comuna).eq("active", true).maybeSingle();
    if (!rate) return { error: `No hay precio de despacho activo para ${comuna}. Agrégalo en Despacho → Precios.` };
  }

  // Mismo camino que una compra en la tienda: revisa stock y lo aparta de forma atómica
  const { data: placed, error: placeErr } = await db.rpc("place_order", {
    p: {
      product_id: productId,
      user_id: "",
      quantity,
      buyer_name: name,
      buyer_email: email,
      buyer_phone: phone,
      delivery,
      address: delivery === "despacho" ? `${address}, ${comuna}` : "",
      comuna: delivery === "despacho" ? comuna : "",
    },
  });
  const order = placed as Order | null;
  if (placeErr || !order?.id) {
    if (placeErr) console.error("[pedido manual]", placeErr);
    return { error: quantity > 1 ? "No quedan tantas unidades disponibles." : "Este producto ya no está disponible o alguien lo está pagando ahora." };
  }

  const patch: Record<string, unknown> = {
    mp_preference_id: MANUAL,
    reserved_until: new Date(Date.now() + HOLD_DAYS * 86_400_000).toISOString(),
  };

  // Precio acordado distinto al publicado (la comisión del vendedor se ajusta en la misma proporción)
  const shipping = order.shipping_amount ?? 0;
  const listed = order.amount - shipping;
  if (priceRaw) {
    const agreed = Math.min(100_000_000, parseInt(priceRaw, 10));
    if (agreed !== listed) {
      patch.amount = agreed + shipping;
      if (order.commission_amount != null && listed > 0) {
        patch.commission_amount = Math.round((order.commission_amount * agreed) / listed);
      }
    }
  }

  if (delivery === "despacho") {
    patch.delivery_slot = slot;
    patch.address_notes = addressNotes || null;
    if (dateRaw) {
      patch.delivery_date = dateRaw;
    } else {
      try {
        const { data: p } = await db.from("products").select("size, category_slug, weight_kg, volume_m3, seller_id").eq("id", productId).single();
        const plan = await deliveryDateFor(orderLoad(p ?? {}, quantity), p?.seller_id ?? null);
        if (plan) patch.delivery_date = plan.date;
      } catch (e) {
        console.warn("[pedido manual] fecha de entrega", e);
      }
    }
  }

  const { error: upErr } = await db.from("orders").update(patch).eq("id", order.id);
  if (upErr) {
    // Sin la migración de rutas no existen delivery_date/slot: guarda lo básico
    console.warn("[pedido manual]", upErr);
    await db.from("orders").update({ mp_preference_id: MANUAL, reserved_until: patch.reserved_until, ...(patch.amount ? { amount: patch.amount } : {}) }).eq("id", order.id);
  }

  if (payment !== "pendiente") {
    const { error } = await db.rpc("mark_order_paid", { p_order_id: order.id, p_payment_id: `${MANUAL}:${payment}` });
    if (error) {
      console.error("[pedido manual] pagar", error);
      return { error: "El pedido quedó creado, pero no se pudo marcar como pagado. Márcalo desde la lista." };
    }
  }

  revalidatePath("/admin/pedidos");
  redirect("/admin/pedidos?creado=1");
}

/** Pedidos cargados a mano que quedaron "por pagar". */
export async function markManualOrderPaid(formData: FormData) {
  await requireSection("pedidos");
  const id = String(formData.get("id") ?? "");
  const method = formData.get("method") === "transferencia" ? "transferencia" : "efectivo";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const db = createAdminClient();
  const { data: o } = await db.from("orders").select("status, mp_preference_id").eq("id", id).maybeSingle();
  if (!o || o.mp_preference_id !== MANUAL || o.status !== "pending") return;
  await db.rpc("mark_order_paid", { p_order_id: id, p_payment_id: `${MANUAL}:${method}` });
  revalidatePath("/admin/pedidos");
}

export async function cancelManualOrder(formData: FormData) {
  await requireSection("pedidos");
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const db = createAdminClient();
  await db.from("orders").update({ status: "cancelled" }).eq("id", id).eq("mp_preference_id", MANUAL).eq("status", "pending");
  revalidatePath("/admin/pedidos");
}
