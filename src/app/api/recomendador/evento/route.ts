import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;
const KINDS = new Set(["view", "share"]);

/**
 * Registra lo que hace el comprador para que la app lo conozca mejor.
 * (Los swipes se registran solos en la base de datos; las búsquedas,
 * pagos y compras, desde el servidor.)
 * Body: { kind: "view" | "share", productId: string, value?: number (ms mirando) }
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { kind?: string; productId?: string; value?: number };
  if (!body.kind || !KINDS.has(body.kind) || !body.productId || !UUID.test(body.productId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ ok: false, skipped: "sin sesión" });

  const value = Number.isFinite(body.value) ? Math.max(0, Math.min(30 * 60_000, Number(body.value))) : null;
  const { error } = await supabase
    .from("user_events")
    .insert({ user_id: user.id, product_id: body.productId, kind: body.kind, value });
  if (error) {
    // Si aún no se corre la migración del recomendador, no rompemos nada
    console.warn("[recomendador/evento]", error.message);
    return NextResponse.json({ ok: false });
  }
  return NextResponse.json({ ok: true });
}
