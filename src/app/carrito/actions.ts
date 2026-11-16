"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCartPreference } from "@/lib/payments";
import { currentPrice } from "@/lib/format";
import { logServerEvent } from "@/lib/recsys/server";
import { formatDeliveryDate, orderLoad, slotLabel, type DeliverySlot } from "@/lib/delivery";
import { deliveryDateFor } from "@/lib/routing/planner";
import type { Checkout, Product } from "@/lib/types";
import type { CartItem } from "@/lib/cart";

export type CartLine = {
  id: string;
  title: string;
  images: string[];
  category_slug: string;
  unitPrice: number;
  originalPrice: number | null;
  /** Unidades que se pueden comprar ahora (0 = ya no está) */
  available: number;
  /** Índice de la entrega a la que pertenece (0 = la principal) */
  group: number;
};

export type CartView = {
  lines: CartLine[];
  /** Una entrega por bodega. Con el marketplace apagado siempre hay una sola. */
  deliveries: { group: number; dateLabel: string | null }[];
  slots: { value: string; label: string }[] | null;
};

const UUID = /^[0-9a-f-]{36}$/i;

function cleanItems(items: CartItem[]) {
  const map = new Map<string, number>();
  for (const i of Array.isArray(items) ? items.slice(0, 30) : []) {
    if (!i || typeof i.id !== "string" || !UUID.test(i.id)) continue;
    map.set(i.id, Math.max(1, Math.min(50, (map.get(i.id) ?? 0) + (Number(i.qty) || 1))));
  }
  return [...map.entries()].map(([id, qty]) => ({ id, qty }));
}

/** Datos frescos del carrito: precios, disponibilidad y fecha de entrega. */
export async function loadCart(items: CartItem[]): Promise<CartView> {
  const clean = cleanItems(items);
  if (!clean.length) return { lines: [], deliveries: [], slots: null };
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("id, title, images, category_slug, price, original_price, flash_price, flash_until, status, quantity, seller_id, size, weight_kg, volume_m3, available_units")
    .in("id", clean.map((i) => i.id));
  const rows = (data ?? []) as (Product & { available_units?: number })[];

  // Cada bodega (MUVEO o un vendedor) es una entrega aparte
  const scopes: (string | null)[] = [];
  const scopeOf = (sellerId: string | null) => {
    const k = sellerId ?? null;
    let i = scopes.indexOf(k);
    if (i < 0) i = scopes.push(k) - 1;
    return i;
  };
  // MUVEO primero
  if (rows.some((r) => !r.seller_id)) scopeOf(null);

  const lines: CartLine[] = [];
  for (const it of clean) {
    const p = rows.find((r) => r.id === it.id);
    if (!p) continue; // borrado u oculto: se quita del carrito
    lines.push({
      id: p.id,
      title: p.title,
      images: p.images ?? [],
      category_slug: p.category_slug,
      unitPrice: currentPrice(p),
      originalPrice: p.original_price ?? null,
      available: p.status === "available" ? Math.max(0, p.available_units ?? p.quantity) : 0,
      group: scopeOf(p.seller_id ?? null),
    });
  }

  const deliveries: CartView["deliveries"] = [];
  let slots: CartView["slots"] = null;
  for (const [group, sellerId] of scopes.entries()) {
    const load = sumLoad(
      lines.filter((l) => l.group === group && l.available > 0).map((l) => ({ p: rows.find((r) => r.id === l.id)!, qty: clean.find((c) => c.id === l.id)!.qty })),
    );
    const plan = load ? await deliveryDateFor(load, sellerId).catch(() => null) : null;
    deliveries.push({ group, dateLabel: plan ? formatDeliveryDate(plan.date) : null });
    if (plan && !slots) {
      slots = (["cualquiera", "manana", "tarde"] as DeliverySlot[]).map((v) => ({ value: v, label: slotLabel(v, plan.settings) }));
    }
  }
  return { lines, deliveries, slots };
}

function sumLoad(items: { p: Parameters<typeof orderLoad>[0]; qty: number }[]) {
  if (!items.length) return null;
  return items.reduce(
    (a, { p, qty }) => {
      const l = orderLoad(p, qty);
      return { kg: a.kg + l.kg, m3: a.m3 + l.m3, rank: Math.max(a.rank, l.rank) };
    },
    { kg: 0, m3: 0, rank: 0 },
  );
}

export type CartCheckoutState = { error?: string; unavailable?: string[] };

export async function startCartCheckout(_prev: CartCheckoutState, formData: FormData): Promise<CartCheckoutState> {
  let items: CartItem[] = [];
  try {
    items = cleanItems(JSON.parse(String(formData.get("items") ?? "[]")));
  } catch {
    items = [];
  }
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const delivery = formData.get("delivery") === "despacho" ? "despacho" : "retiro";
  const address = String(formData.get("address") ?? "").trim();
  const comuna = String(formData.get("comuna") ?? "").trim();
  const addressNotes = String(formData.get("address_notes") ?? "").trim().slice(0, 200);
  const slotRaw = String(formData.get("delivery_slot") ?? "");
  const slot = slotRaw === "manana" || slotRaw === "tarde" ? slotRaw : "cualquiera";

  if (!items.length) return { error: "Tu carrito está vacío." };
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

  // Crea la compra y aparta TODAS las unidades 15 minutos (todo o nada, en la base de datos)
  const { data: placed, error: placeErr } = await db.rpc("place_cart", {
    p: {
      user_id: user.id,
      buyer_name: name,
      buyer_email: email,
      buyer_phone: phone,
      delivery,
      address: delivery === "despacho" ? `${address}, ${comuna}` : "",
      comuna: delivery === "despacho" ? comuna : "",
      items: items.map((i) => ({ product_id: i.id, quantity: i.qty })),
    },
  });
  const res = placed as { ok: boolean; reason?: string; product_id?: string; checkout?: Checkout } | null;
  if (placeErr || !res?.ok || !res.checkout) {
    if (placeErr) console.error("[carrito]", placeErr);
    if (res?.reason === "comuna") return { error: `Por ahora no despachamos a ${comuna}. Puedes elegir retiro.` };
    if (res?.reason === "unavailable" && res.product_id) {
      return {
        error: "Uno de tus productos ya no está disponible o alguien lo está pagando ahora. Lo marcamos en tu carrito.",
        unavailable: [res.product_id],
      };
    }
    return { error: "No pudimos crear tu compra. Intenta de nuevo." };
  }
  const checkout = res.checkout;

  const { data: orders } = await db
    .from("orders")
    .select("id, product_id, quantity, amount, shipping_amount, seller_id, products(title, images, size, category_slug, weight_kg, volume_m3)")
    .eq("checkout_id", checkout.id);
  type Row = {
    id: string; product_id: string; quantity: number; amount: number; shipping_amount: number; seller_id: string | null;
    products: { title: string; images: string[]; size: string | null; category_slug: string; weight_kg: number | null; volume_m3: number | null } | null;
  };
  const rows = (orders ?? []) as unknown as Row[];

  // Despacho: una sola fecha y franja por bodega para todos sus productos (llegan juntos)
  if (delivery === "despacho") {
    const scopes = [...new Set(rows.map((r) => r.seller_id ?? null))];
    for (const sellerId of scopes) {
      const group = rows.filter((r) => (r.seller_id ?? null) === sellerId);
      try {
        const load = sumLoad(group.map((r) => ({ p: r.products ?? {}, qty: r.quantity })));
        const plan = load ? await deliveryDateFor(load, sellerId) : null;
        if (plan) {
          await db
            .from("orders")
            .update({ delivery_date: plan.date, delivery_slot: slot, address_notes: addressNotes || null })
            .in("id", group.map((r) => r.id));
        }
      } catch (e) {
        console.warn("[carrito] fecha de entrega", e);
      }
    }
  }

  for (const r of rows) await logServerEvent(user.id, "checkout", r.product_id);

  const shippingCharges = rows.filter((r) => r.shipping_amount > 0).map((r) => r.shipping_amount);
  let payUrl: string | null = null;
  try {
    const pref = await createCartPreference({
      checkoutId: checkout.id,
      items: rows.map((r) => ({
        id: r.product_id,
        title: r.products?.title ?? "Producto",
        quantity: r.quantity,
        unitPrice: Math.round((r.amount - r.shipping_amount) / r.quantity),
        pictureUrl: r.products?.images?.[0],
      })),
      shipping: shippingCharges.map((amount, i) => ({
        title: shippingCharges.length > 1 ? `Despacho ${i + 1}` : "Despacho",
        amount,
      })),
      buyer: { name, email },
      expiresAt: new Date(checkout.reserved_until ?? Date.now() + 15 * 60_000),
    });
    await db.from("checkouts").update({ mp_preference_id: pref.id }).eq("id", checkout.id);
    await db.from("orders").update({ mp_preference_id: pref.id }).eq("checkout_id", checkout.id);
    payUrl = pref.url;
  } catch (e) {
    console.error("[carrito]", e);
  }
  if (!payUrl) {
    // Libera las unidades apartadas
    await db.from("checkouts").update({ status: "failed" }).eq("id", checkout.id);
    await db.from("orders").update({ status: "failed" }).eq("checkout_id", checkout.id);
    return { error: "No pudimos conectar con Mercado Pago. Intenta en unos minutos." };
  }

  redirect(payUrl);
}
