"use server";

import { revalidatePath } from "next/cache";
import { requireSeller } from "@/lib/seller";

export async function markDelivered(formData: FormData) {
  const { supabase } = await requireSeller();
  const orderId = String(formData.get("orderId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return;
  // La función valida que el pedido sea de esta tienda y esté pagado
  await supabase.rpc("seller_mark_delivered", { p_order_id: orderId });
  revalidatePath("/vendedor/pedidos");
}
