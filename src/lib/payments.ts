import "server-only";
import crypto from "node:crypto";
import MercadoPagoConfig, { Payment, PaymentRefund, Preference } from "mercadopago";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";
import { brand } from "@/brand";
import { logServerEvent } from "@/lib/recsys/server";

function mpConfig() {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error("Falta MP_ACCESS_TOKEN en las variables de entorno");
  return new MercadoPagoConfig({ accessToken, options: { timeout: 10000 } });
}

/** Crea la preferencia de Checkout Pro y devuelve la URL de pago. */
export async function createPreference(input: {
  orderId: string;
  productId: string;
  title: string;
  quantity: number;
  unitPrice: number;
  /** Costo del despacho (0 si retira) */
  shipping?: number;
  pictureUrl?: string;
  buyer: { name: string; email: string };
  expiresAt: Date;
}) {
  const site = siteUrl();
  const isPublic = site.startsWith("https://");
  const back = `${site}/pedido/${input.orderId}`;

  const pref = await new Preference(mpConfig()).create({
    body: {
      items: [
        {
          id: input.productId,
          title: input.title,
          quantity: input.quantity,
          unit_price: input.unitPrice,
          currency_id: "CLP",
          picture_url: input.pictureUrl,
        },
        ...(input.shipping && input.shipping > 0
          ? [{ id: "despacho", title: "Despacho", quantity: 1, unit_price: input.shipping, currency_id: "CLP" }]
          : []),
      ],
      payer: { name: input.buyer.name, email: input.buyer.email },
      external_reference: input.orderId,
      back_urls: { success: back, failure: back, pending: back },
      // Mercado Pago solo acepta auto_return y notification_url con URLs públicas (https)
      ...(isPublic
        ? { auto_return: "approved", notification_url: `${site}/api/mercadopago/webhook` }
        : {}),
      expires: true,
      expiration_date_to: input.expiresAt.toISOString(),
      statement_descriptor: brand.statementDescriptor,
    },
    requestOptions: { idempotencyKey: input.orderId },
  });

  return { id: pref.id ?? null, url: pref.init_point ?? pref.sandbox_init_point ?? null };
}

/** Prefijo de external_reference para las compras del carrito (varios productos, un pago). */
export const CART_REF = "carrito:";

/** Crea la preferencia de Checkout Pro de un carrito: todos los productos y despachos en un solo pago. */
export async function createCartPreference(input: {
  checkoutId: string;
  items: { id: string; title: string; quantity: number; unitPrice: number; pictureUrl?: string }[];
  /** Un cobro por cada despacho (normalmente uno solo) */
  shipping: { title: string; amount: number }[];
  buyer: { name: string; email: string };
  expiresAt: Date;
}) {
  const site = siteUrl();
  const isPublic = site.startsWith("https://");
  const back = `${site}/compra/${input.checkoutId}`;

  const pref = await new Preference(mpConfig()).create({
    body: {
      items: [
        ...input.items.map((it) => ({
          id: it.id,
          title: it.title,
          quantity: it.quantity,
          unit_price: it.unitPrice,
          currency_id: "CLP",
          picture_url: it.pictureUrl,
        })),
        ...input.shipping
          .filter((s) => s.amount > 0)
          .map((s, i) => ({ id: `despacho-${i + 1}`, title: s.title, quantity: 1, unit_price: s.amount, currency_id: "CLP" })),
      ],
      payer: { name: input.buyer.name, email: input.buyer.email },
      external_reference: `${CART_REF}${input.checkoutId}`,
      back_urls: { success: back, failure: back, pending: back },
      ...(isPublic
        ? { auto_return: "approved", notification_url: `${site}/api/mercadopago/webhook` }
        : {}),
      expires: true,
      expiration_date_to: input.expiresAt.toISOString(),
      statement_descriptor: brand.statementDescriptor,
    },
    requestOptions: { idempotencyKey: `carrito-${input.checkoutId}` },
  });

  return { id: pref.id ?? null, url: pref.init_point ?? pref.sandbox_init_point ?? null };
}

/** Pago de un carrito: actualiza la compra y todos sus pedidos. */
async function syncCartPayment(payment: Awaited<ReturnType<Payment["get"]>>, checkoutId: string) {
  const db = createAdminClient();
  const { data: checkout } = await db.from("checkouts").select("*").eq("id", checkoutId).maybeSingle();
  if (!checkout) return null;

  if (payment.status === "approved") {
    if (payment.transaction_amount != null && Math.round(payment.transaction_amount) < checkout.amount) {
      console.error("[mp] monto pagado menor al de la compra", checkoutId);
      return "amount_mismatch";
    }
    await db.rpc("mark_checkout_paid", { p_checkout_id: checkoutId, p_payment_id: String(payment.id) });
    if (checkout.status !== "paid") {
      const { data: orders } = await db.from("orders").select("product_id").eq("checkout_id", checkoutId);
      for (const o of orders ?? []) await logServerEvent(checkout.user_id, "purchase", o.product_id);
    }
    return "paid";
  }

  if (["rejected", "cancelled", "refunded", "charged_back"].includes(payment.status ?? "")) {
    if (checkout.status === "pending") {
      const status = payment.status === "cancelled" ? "cancelled" : "failed";
      await db.from("checkouts").update({ status, mp_payment_id: String(payment.id) }).eq("id", checkoutId);
      // Al dejar de estar "pending", las unidades apartadas se liberan solas
      await db.from("orders").update({ status, mp_payment_id: String(payment.id) }).eq("checkout_id", checkoutId).eq("status", "pending");
    } else if (checkout.status === "paid" && ["refunded", "charged_back"].includes(payment.status ?? "")) {
      const now = new Date().toISOString();
      await db.from("checkouts").update({ status: "refunded" }).eq("id", checkoutId);
      await db
        .from("orders")
        .update({ status: "refunded", refunded_at: now })
        .eq("checkout_id", checkoutId)
        .eq("status", "paid")
        .is("payout_at", null);
      return "refunded";
    }
    return "failed";
  }

  return "pending";
}

/**
 * Consulta un pago en Mercado Pago y actualiza el pedido y el producto.
 * Es idempotente: se puede llamar desde el webhook y desde la página de retorno.
 */
export async function syncPayment(paymentId: string) {
  const payment = await new Payment(mpConfig()).get({ id: paymentId });
  const orderId = payment.external_reference;
  if (!orderId) return null;
  if (orderId.startsWith(CART_REF)) return syncCartPayment(payment, orderId.slice(CART_REF.length));

  const db = createAdminClient();
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) return null;

  if (payment.status === "approved") {
    if (payment.transaction_amount != null && Math.round(payment.transaction_amount) < order.amount) {
      console.error("[mp] monto pagado menor al del pedido", orderId);
      return "amount_mismatch";
    }
    await db.rpc("mark_order_paid", { p_order_id: orderId, p_payment_id: String(payment.id) });
    await logServerEvent(order.user_id, "purchase", order.product_id);
    return "paid";
  }

  if (["rejected", "cancelled", "refunded", "charged_back"].includes(payment.status ?? "")) {
    if (order.status === "pending") {
      await db
        .from("orders")
        .update({ status: payment.status === "cancelled" ? "cancelled" : "failed", mp_payment_id: String(payment.id) })
        .eq("id", orderId);
      // Al dejar de estar "pending", las unidades apartadas se liberan solas
    } else if (order.status === "paid" && ["refunded", "charged_back"].includes(payment.status ?? "")) {
      // Devuelto desde el panel de Mercado Pago o contracargo: no se le paga al vendedor
      await db
        .from("orders")
        .update({ status: "refunded", refunded_at: new Date().toISOString() })
        .eq("id", orderId)
        .is("payout_at", null);
      return "refunded";
    }
    return "failed";
  }

  return "pending";
}

/**
 * Valida la firma x-signature de los webhooks de Mercado Pago.
 * https://www.mercadopago.cl/developers/es/docs/your-integrations/notifications/webhooks
 */
export function verifyWebhookSignature(opts: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string;
}) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true; // sin secreto configurado (desarrollo)
  if (!opts.xSignature) return false;

  const parts = Object.fromEntries(
    opts.xSignature.split(",").map((p) => {
      const [k, ...v] = p.trim().split("=");
      return [k, v.join("=")];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const id = /^[a-z0-9]+$/i.test(opts.dataId) ? opts.dataId.toLowerCase() : opts.dataId;
  let manifest = `id:${id};`;
  if (opts.xRequestId) manifest += `request-id:${opts.xRequestId};`;
  manifest += `ts:${ts};`;

  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Devuelve el total de un pedido pagado al comprador (Mercado Pago) y repone el stock.
 * La usa el admin al resolver un reclamo.
 */
export async function refundOrder(orderId: string) {
  const db = createAdminClient();
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order || order.status !== "paid") return { error: "El pedido no está pagado." };
  if (order.payout_at) return { error: "Ya se le transfirió al vendedor: devuélvelo a mano y pídeselo al vendedor." };
  if (!order.mp_payment_id) return { error: "El pedido no tiene pago de Mercado Pago asociado." };

  if (order.checkout_id) {
    // Compra del carrito: el pago incluye otros productos, se devuelve solo este pedido
    await new PaymentRefund(mpConfig()).create({
      payment_id: order.mp_payment_id,
      body: { amount: order.amount },
      requestOptions: { idempotencyKey: `refund-${orderId}` },
    });
  } else {
    await new PaymentRefund(mpConfig()).total({
      payment_id: order.mp_payment_id,
      requestOptions: { idempotencyKey: `refund-${orderId}` },
    });
  }

  await db.from("orders").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("id", orderId);
  // Repone las unidades (si estaba agotado vuelve a estar disponible)
  const { data: product } = await db.from("products").select("quantity").eq("id", order.product_id).maybeSingle();
  if (product) await db.from("products").update({ quantity: product.quantity + order.quantity }).eq("id", order.product_id);
  return { ok: true };
}
