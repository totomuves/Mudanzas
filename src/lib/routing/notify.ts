import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { pushEnabled, sendPush, type PushNotification } from "@/lib/recsys/push";

type Db = ReturnType<typeof createAdminClient>;

export type DeliveryNoticeKind = "entrega_fecha" | "entrega_camino" | "entrega_lista" | "entrega_fallida";

/**
 * Aviso al comprador sobre su entrega: queda en la campana de la app (/avisos)
 * y, si hay claves VAPID, llega como notificación al teléfono.
 * Un aviso por pedido y tipo: si se repite (ej. cambia el horario), se actualiza.
 */
export async function notifyOrder(
  db: Db,
  order: { id: string; user_id: string | null; product_id: string },
  kind: DeliveryNoticeKind,
  title: string,
  body: string,
) {
  if (!order.user_id) return;
  const { data, error } = await db
    .from("notifications")
    .upsert(
      {
        user_id: order.user_id,
        product_id: order.product_id,
        kind,
        title,
        body,
        url: `/pedido/${order.id}`,
        read_at: null,
        pushed_at: null,
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id,product_id,kind" },
    )
    .select("id, user_id, title, body, url")
    .single();
  if (error) {
    console.warn("[entregas] aviso", error.message);
    return;
  }
  if (pushEnabled()) {
    try {
      await sendPush([data as PushNotification]);
    } catch (e) {
      console.warn("[entregas] push", e);
    }
  }
}
