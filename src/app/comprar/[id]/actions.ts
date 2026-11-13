"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentPrice } from "@/lib/format";
import { createPreference } from "@/lib/payments";
import type { Product } from "@/lib/types";

export type CheckoutState = { error?: string };

export async function startCheckout(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const productId = String(formData.get("productId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const delivery = formData.get("delivery") === "despacho" ? "despacho" : "retiro";
  const address = String(formData.get("address") ?? "").trim();

  if (name.length < 2) return { error: "Escribe tu nombre." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Revisa tu correo." };
  if (phone.replace(/\D/g, "").length < 8) return { error: "Escribe un teléfono de contacto." };
  if (delivery === "despacho" && address.length < 5) return { error: "Escribe la dirección de despacho." };

  const supabase = await createClient();
  let {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const { data } = await supabase.auth.signInAnonymously();
    user = data.user;
  }
  if (!user) return { error: "No pudimos iniciar tu sesión. Intenta de nuevo." };

  const db = createAdminClient();

  // Reserva el producto 15 minutos para que nadie más lo compre mientras pagas
  const { data: reserved } = await db.rpc("reserve_product", {
    p_product_id: productId,
    p_user_id: user.id,
  });
  const product = reserved as Product | null;
  if (!product?.id) {
    return { error: "¡Uy! Este producto ya no está disponible o alguien lo está pagando ahora." };
  }

  const amount = currentPrice(product);
  const { data: order, error: orderErr } = await db
    .from("orders")
    .insert({
      user_id: user.id,
      product_id: product.id,
      amount,
      buyer_name: name,
      buyer_email: email,
      buyer_phone: phone,
      delivery,
      address: delivery === "despacho" ? address : null,
    })
    .select("id")
    .single();
  if (orderErr || !order) return { error: "No pudimos crear tu pedido. Intenta de nuevo." };

  let payUrl: string | null = null;
  try {
    const pref = await createPreference({
      orderId: order.id,
      productId: product.id,
      title: product.title,
      amount,
      pictureUrl: product.images[0],
      buyer: { name, email },
      expiresAt: new Date(product.reserved_until ?? Date.now() + 15 * 60_000),
    });
    await db.from("orders").update({ mp_preference_id: pref.id }).eq("id", order.id);
    payUrl = pref.url;
  } catch (e) {
    console.error("[checkout]", e);
  }
  if (!payUrl) {
    await db.from("orders").update({ status: "failed" }).eq("id", order.id);
    await db.from("products").update({ reserved_by: null, reserved_until: null }).eq("id", product.id);
    return { error: "No pudimos conectar con Mercado Pago. Intenta en unos minutos." };
  }

  redirect(payUrl);
}
