"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPreference } from "@/lib/payments";
import type { Order } from "@/lib/types";
import { logServerEvent } from "@/lib/recsys/server";

export type CheckoutState = { error?: string };

export async function startCheckout(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const productId = String(formData.get("productId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const delivery = formData.get("delivery") === "despacho" ? "despacho" : "retiro";
  const address = String(formData.get("address") ?? "").trim();
  const comuna = String(formData.get("comuna") ?? "").trim();

  if (name.length < 2) return { error: "Escribe tu nombre." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Revisa tu correo." };
  if (phone.replace(/\D/g, "").length < 8) return { error: "Escribe un teléfono de contacto." };
  if (delivery === "despacho" && !comuna) return { error: "Elige la comuna de despacho." };
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

  if (delivery === "despacho") {
    const { data: rate } = await db.from("shipping_rates").select("price").eq("comuna", comuna).eq("active", true).maybeSingle();
    if (!rate) return { error: `Por ahora no despachamos a ${comuna}. Puedes elegir retiro.` };
  }

  const quantity = Math.max(1, Math.min(50, parseInt(String(formData.get("quantity") ?? "1"), 10) || 1));

  // Crea el pedido y aparta las unidades 15 minutos (atómico, en la base de datos)
  const { data: placed, error: placeErr } = await db.rpc("place_order", {
    p: {
      product_id: productId,
      user_id: user.id,
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
    if (placeErr) console.error("[checkout]", placeErr);
    return {
      error:
        quantity > 1
          ? "No quedan tantas unidades disponibles. Prueba con menos."
          : "¡Uy! Este producto ya no está disponible o alguien lo está pagando ahora.",
    };
  }

  // Empezar a pagar dice mucho de lo que le gusta
  await logServerEvent(user.id, "checkout", productId);

  const { data: product } = await db.from("products").select("title, images").eq("id", productId).single();

  let payUrl: string | null = null;
  try {
    const pref = await createPreference({
      orderId: order.id,
      productId,
      title: product?.title ?? "Producto",
      quantity,
      unitPrice: Math.round((order.amount - (order.shipping_amount ?? 0)) / quantity),
      shipping: order.shipping_amount ?? 0,
      pictureUrl: product?.images?.[0],
      buyer: { name, email },
      expiresAt: new Date(order.reserved_until ?? Date.now() + 15 * 60_000),
    });
    await db.from("orders").update({ mp_preference_id: pref.id }).eq("id", order.id);
    payUrl = pref.url;
  } catch (e) {
    console.error("[checkout]", e);
  }
  if (!payUrl) {
    // Libera las unidades apartadas
    await db.from("orders").update({ status: "failed" }).eq("id", order.id);
    return { error: "No pudimos conectar con Mercado Pago. Intenta en unos minutos." };
  }

  redirect(payUrl);
}
