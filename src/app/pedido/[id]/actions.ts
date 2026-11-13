"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ReceiptState = { ok?: string; error?: string };

export async function confirmReceipt(_prev: ReceiptState, formData: FormData): Promise<ReceiptState> {
  const orderId = String(formData.get("orderId") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("buyer_confirm_order", { p_order_id: orderId });
  if (error || !data) return { error: "No pudimos registrar tu confirmación. Intenta de nuevo." };
  revalidatePath(`/pedido/${orderId}`);
  return { ok: "¡Gracias! Confirmaste que recibiste todo bien." };
}

export async function reportIssue(_prev: ReceiptState, formData: FormData): Promise<ReceiptState> {
  const orderId = String(formData.get("orderId") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (text.length < 5) return { error: "Cuéntanos qué pasó para poder ayudarte." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("buyer_report_issue", { p_order_id: orderId, p_text: text });
  if (error || !data) return { error: "No pudimos registrar tu reclamo. Escríbenos por WhatsApp." };
  revalidatePath(`/pedido/${orderId}`);
  return { ok: "Recibimos tu reclamo. Retuvimos el pago y te contactaremos para resolverlo." };
}
