import { NextResponse, type NextRequest } from "next/server";
import { hasAdminSection } from "@/lib/admin-api";
import { getUser } from "@/lib/supabase/server";
import { indexPending } from "@/lib/recsys/indexer";

// Analizar con IA puede tardar unos segundos por producto
export const maxDuration = 60;

let lastSweep = 0;

/**
 * Analiza productos para el recomendador.
 *  - Admin: { productIds?: string[], limit?: number } (sin ids = los pendientes)
 *  - Cualquier visitante: solo dispara una pasada corta por los pendientes,
 *    como mucho cada 30 segundos (así los productos nuevos de cualquier
 *    vendedor quedan analizados solos, sin depender de quién los subió).
 */
export async function POST(request: NextRequest) {
  if (!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, skipped: "sin SUPABASE_SECRET_KEY" });
  }
  const body = (await request.json().catch(() => ({}))) as { productIds?: unknown; limit?: unknown };
  const admin = await hasAdminSection("recomendador", "productos");

  try {
    if (admin) {
      const ids = Array.isArray(body.productIds)
        ? body.productIds.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x))
        : undefined;
      const limit = Math.max(1, Math.min(25, Number(body.limit) || 10));
      return NextResponse.json({ ok: true, ...(await indexPending({ ids, limit })) });
    }

    const { user } = await getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });
    if (Date.now() - lastSweep < 30_000) return NextResponse.json({ ok: true, skipped: "reciente" });
    lastSweep = Date.now();
    return NextResponse.json({ ok: true, ...(await indexPending({ limit: 4 })) });
  } catch (e) {
    console.error("[recomendador/indexar]", e);
    return NextResponse.json({ ok: false, error: "No se pudo analizar" }, { status: 500 });
  }
}
