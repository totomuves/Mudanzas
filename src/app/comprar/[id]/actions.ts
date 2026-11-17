"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPreference } from "@/lib/payments";
import type { Order } from "@/lib/types";
import { logServerEvent } from "@/lib/recsys/server";
import { orderLoad } from "@/lib/delivery";
import { deliveryDateFor } from "@/lib/routing/planner";
import { getPricing, quoteItems } from "@/lib/routing/quote";

export type CheckoutState = { error?: string };

export async function startCheckout(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const productId = String(formData.get("productId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const delivery = formData.get("delivery") === "despacho" ? "despacho" : "retiro";
  const address = String(formData.get("address") ?? "").trim();
  const comuna = String(formData.get("comuna") ?? "").trim();
  const addressNotes = String(formData.get("address_notes") ?? "").trim().slice(0, 200);
  const slotRaw = String(formData.get("delivery_slot") ?? "");
  const slot = slotRaw === "manana" || slotRaw === "tarde" ? slotRaw : "cualquiera";

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

  const quantity = Math.max(1, Math.min(50, parseInt(String(formData.get("quantity") ?? "1"), 10) || 1));

  // Despacho: precio fijo de la comuna, o calculado con la dirección (automático)
  let shippingPrice: number | undefined;
  if (delivery === "despacho") {
    if ((await getPricing(db)).pricing_mode === "automatico") {
      const q = await quoteItems([{ id: productId, qty: quantity }], comuna, address, db).catch((e) => {
        console.error("[checkout] despacho automático", e);
        return null;
      });
      if (!q) return { error: "No pudimos calcular el despacho. Intenta de nuevo." };
      if (!q.ok) return { error: q.reason === "far" ? "Por ahora no despachamos tan lejos. Puedes elegir retiro." : `Por ahora no despachamos a ${comuna}. Puedes elegir retiro.` };
      shippingPrice = q.total;
    } else {
      const { data: rate } = await db.from("shipping_rates").select("price").eq("comuna", comuna).eq("active", true).maybeSingle();
      if (!rate) return { error: `Por ahora no despachamos a ${comuna}. Puedes elegir retiro.` };
    }
  }

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
      ...(shippingPrice != null ? { shipping_price: shippingPrice } : {}),
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

  // Despacho: fecha de entrega (el próximo día con espacio en la flota) y franja elegida
  if (delivery === "despacho") {
    try {
      const { data: p } = await db.from("products").select("size, category_slug, weight_kg, volume_m3, seller_id").eq("id", productId).single();
      const plan = await deliveryDateFor(orderLoad(p ?? {}, quantity), p?.seller_id ?? null);
      if (plan) {
        await db.from("orders").update({ delivery_date: plan.date, delivery_slot: slot, address_notes: addressNotes || null }).eq("id", order.id);
      }
    } catch (e) {
      // Si aún no se corre la migración de rutas, el pedido sigue igual
      console.warn("[checkout] fecha de entrega", e);
    }
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
