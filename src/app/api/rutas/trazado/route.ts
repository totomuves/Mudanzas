import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { roadPath } from "@/lib/routing/path";

/**
 * Trazado por calles de una ruta (para dibujarla en el mapa).
 * Solo para usuarios con cuenta (equipo de reparto, despacho y vendedores).
 */
export async function POST(request: NextRequest) {
  const { user } = await getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { points?: unknown };
  const points = Array.isArray(body.points)
    ? body.points
        .map((p) => ({ lat: Number((p as { lat?: unknown }).lat), lng: Number((p as { lng?: unknown }).lng) }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)
    : [];
  if (points.length < 2 || points.length > 200) return NextResponse.json({ error: "Puntos inválidos" }, { status: 400 });
  const r = await roadPath(points);
  return NextResponse.json(r ?? { path: null });
}
