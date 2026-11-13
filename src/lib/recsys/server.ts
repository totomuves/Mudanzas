import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { embedQuery } from "./indexer";

/** Anota un evento del servidor (pago iniciado, compra). Nunca lanza error. */
export async function logServerEvent(userId: string | null | undefined, kind: "checkout" | "purchase", productId: string) {
  if (!userId) return;
  try {
    const db = createAdminClient();
    if (kind === "purchase") {
      // Idempotente: el webhook y la página de retorno pueden llamar dos veces
      const { count } = await db
        .from("user_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("product_id", productId)
        .eq("kind", "purchase");
      if (count) return;
    }
    const { error } = await db.from("user_events").insert({ user_id: userId, product_id: productId, kind });
    if (error) console.warn("[recomendador] evento", kind, error.message);
  } catch (e) {
    console.warn("[recomendador] evento", kind, e);
  }
}

/** Anota una búsqueda con su huella (lo que busca dice mucho de lo que quiere). */
export async function logSearch(userId: string, q: string) {
  try {
    const query = q.trim().slice(0, 80);
    if (query.length < 2) return;
    const { vector, model } = await embedQuery(query);
    const db = createAdminClient();
    const { error } = await db
      .from("user_events")
      .insert({ user_id: userId, kind: "search", query, query_embedding: vector, model });
    if (error) console.warn("[recomendador] búsqueda", error.message);
  } catch (e) {
    console.warn("[recomendador] búsqueda", e);
  }
}
