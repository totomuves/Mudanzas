import { NextResponse, type NextRequest } from "next/server";
import { syncPayment, verifyWebhookSignature } from "@/lib/payments";

/** Notificaciones de Mercado Pago (Webhooks). */
export async function POST(request: NextRequest) {
  const url = request.nextUrl;
  const body = (await request.json().catch(() => ({}))) as {
    type?: string;
    action?: string;
    data?: { id?: string | number };
  };

  const type = body.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const dataId = String(body.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");

  if (type !== "payment" || !dataId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const valid = verifyWebhookSignature({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    // Mercado Pago firma usando el data.id de la URL
    dataId: url.searchParams.get("data.id") ?? dataId,
  });
  if (!valid) {
    return NextResponse.json({ ok: false, error: "firma inválida" }, { status: 401 });
  }

  try {
    const result = await syncPayment(dataId);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("[mp webhook]", e);
    // 500 => Mercado Pago reintentará la notificación
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
