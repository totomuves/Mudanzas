import "server-only";
import crypto from "node:crypto";
import MercadoPagoConfig, { Payment, Preference } from "mercadopago";
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

/**
 * Consulta un pago en Mercado Pago y actualiza el pedido y el producto.
 * Es idempotente: se puede llamar desde el webhook y desde la página de retorno.
 */
export async function syncPayment(paymentId: string) {
  const payment = await new Payment(mpConfig()).get({ id: paymentId });
  const orderId = payment.external_reference;
  if (!orderId) return null;

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
