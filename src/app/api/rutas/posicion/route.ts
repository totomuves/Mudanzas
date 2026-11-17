import { NextResponse, type NextRequest } from "next/server";
import { accessibleRoutes as allowed, readPositions, savePosition } from "@/lib/routing/position";

const isId = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

/** El celular del chofer envía dónde va. */
export async function POST(request: NextRequest) {
  const b = (await request.json().catch(() => ({}))) as { routeId?: string; lat?: number; lng?: number; accuracy?: number };
  const routeId = String(b.routeId ?? "");
  if (!isId(routeId)) return NextResponse.json({ ok: false }, { status: 400 });
  if (!(await allowed([routeId])).length) return NextResponse.json({ ok: false }, { status: 403 });
  await savePosition(routeId, { lat: Number(b.lat), lng: Number(b.lng), accuracy: b.accuracy == null ? null : Number(b.accuracy) });
  return NextResponse.json({ ok: true });
}

/** El admin pregunta dónde van los vehículos: ?ids=uuid,uuid */
export async function GET(request: NextRequest) {
  const ids = (request.nextUrl.searchParams.get("ids") ?? "").split(",").filter(isId).slice(0, 50);
  if (!ids.length) return NextResponse.json({ positions: [] });
  const ok = await allowed(ids);
  return NextResponse.json({ positions: await readPositions(ok) }, { headers: { "Cache-Control": "no-store" } });
}
