import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Avisos de productos nuevos que calzan con cada comprador.
 * Siempre quedan en la campana de la app (/avisos). Además, si hay claves
 * VAPID configuradas, llegan como notificación al teléfono o navegador.
 *
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY  (npx web-push generate-vapid-keys)
 *   VAPID_SUBJECT  (opcional, ej. mailto:hola@totomuves.cl)
 */

export function pushEnabled() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

type Notification = { id: number; user_id: string; title: string; body: string | null; url: string | null };

/** Calcula a quién avisar de estos productos nuevos y les envía la notificación. */
export async function notifyNewProducts(productIds: string[]) {
  if (productIds.length === 0) return 0;
  const db = createAdminClient();
  const created: Notification[] = [];
  for (const id of productIds) {
    const { data, error } = await db.rpc("notify_matches", { p_product_id: id });
    if (error) {
      // Si aún no se corre la migración de avisos, no pasa nada
      if (!/notify_matches/.test(error.message)) console.warn("[avisos]", error.message);
      return 0;
    }
    created.push(...((data ?? []) as Notification[]));
  }
  if (created.length && pushEnabled()) await sendPush(created);
  return created.length;
}

async function sendPush(items: Notification[]) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:avisos@totomuves.cl",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  const db = createAdminClient();
  const users = [...new Set(items.map((i) => i.user_id))];
  const { data: subs } = await db.from("push_subscriptions").select("*").in("user_id", users);
  for (const n of items) {
    for (const s of (subs ?? []).filter((x) => x.user_id === n.user_id)) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: n.title, body: n.body, url: n.url ?? "/avisos", tag: `aviso-${n.id}` }),
          { TTL: 60 * 60 * 24 },
        );
        await db.from("notifications").update({ pushed_at: new Date().toISOString() }).eq("id", n.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // El navegador ya no acepta la suscripción: se borra
        if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        else console.warn("[avisos] push", status, e);
      }
    }
  }
}
