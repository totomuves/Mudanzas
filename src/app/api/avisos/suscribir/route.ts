import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";

type Sub = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

/** Guarda (POST) o borra (DELETE) la suscripción a notificaciones de este navegador. */
export async function POST(request: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const sub = (await request.json().catch(() => ({}))) as Sub;
  if (!sub.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const { error } = await supabase.from("push_subscriptions").upsert({
    endpoint: sub.endpoint,
    user_id: user.id,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
  });
  if (error) console.warn("[avisos/suscribir]", error.message);
  return NextResponse.json({ ok: !error });
}

export async function DELETE(request: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { endpoint } = (await request.json().catch(() => ({}))) as { endpoint?: string };
  if (endpoint) await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
