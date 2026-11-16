import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSections } from "@/lib/admin";
import { siteUrl } from "@/lib/env";
import { buildReceiptPdf } from "@/lib/routing/receipt-pdf";

/**
 * Comprobante de entrega en PDF.
 * Lo pueden descargar el comprador del pedido, el equipo (Pedidos o Despacho)
 * y el chofer de la ruta.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/entregas/[orderId]/comprobante">) {
  const { orderId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return new NextResponse("No encontrado", { status: 404 });
  const { supabase, user } = await getUser();
  if (!user) return new NextResponse("Inicia sesión para descargar el comprobante", { status: 401 });

  const db = createAdminClient();
  const { data } = await db
    .from("route_stops")
    .select("*, delivery_routes(driver_id, delivery_date, vehicles(name, plate)), orders(id, user_id, quantity, amount, buyer_name, buyer_email, address, products(title))")
    .eq("order_id", orderId)
    .maybeSingle();
  const stop = data as null | {
    status: string; receipt_code: string; delivered_at: string | null; received_by: string | null; receiver_rut: string | null;
    signature_path: string | null; photo_path: string | null; delivered_lat: number | null; delivered_lng: number | null;
    delivered_accuracy_m: number | null; window_start: string | null; window_end: string | null;
    delivery_routes: { driver_id: string | null; delivery_date: string; vehicles: { name: string; plate: string | null } | null } | null;
    orders: { id: string; user_id: string | null; quantity: number; amount: number; buyer_name: string; buyer_email: string; address: string | null; products: { title: string } | null } | null;
  };
  if (!stop || !stop.orders || stop.status !== "entregado" || !stop.delivered_at) {
    return new NextResponse("Este pedido aún no tiene comprobante de entrega", { status: 404 });
  }

  let allowed = stop.orders.user_id === user.id || stop.delivery_routes?.driver_id === user.id;
  if (!allowed) {
    const { sections } = await getAdminSections(supabase, user.id);
    allowed = sections.includes("pedidos") || sections.includes("despacho");
  }
  if (!allowed) return new NextResponse("No encontrado", { status: 404 });

  const download = async (path: string | null) => {
    if (!path) return { bytes: null, type: null };
    const { data: blob } = await db.storage.from("entregas").download(path);
    return blob ? { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type } : { bytes: null, type: null };
  };
  const [sig, photo] = await Promise.all([download(stop.signature_path), download(stop.photo_path)]);
  const v = stop.delivery_routes?.vehicles;

  const bytes = await buildReceiptPdf({
    code: stop.receipt_code,
    orderId: stop.orders.id,
    product: stop.orders.products?.title ?? "Producto",
    quantity: stop.orders.quantity,
    amount: stop.orders.amount,
    buyerName: stop.orders.buyer_name,
    buyerEmail: stop.orders.buyer_email,
    address: stop.orders.address ?? "",
    deliveredAt: stop.delivered_at,
    deliveryDate: stop.delivery_routes?.delivery_date ?? stop.delivered_at.slice(0, 10),
    windowStart: stop.window_start,
    windowEnd: stop.window_end,
    receivedBy: stop.received_by ?? "",
    receiverRut: stop.receiver_rut,
    lat: stop.delivered_lat,
    lng: stop.delivered_lng,
    accuracy: stop.delivered_accuracy_m,
    vehicle: v ? `${v.name}${v.plate ? ` (${v.plate})` : ""}` : null,
    signature: sig.bytes,
    signatureType: sig.type,
    photo: photo.bytes,
    photoType: photo.type,
    verifyUrl: `${siteUrl()}/pedido/${stop.orders.id}`,
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="comprobante-entrega-${stop.receipt_code}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
