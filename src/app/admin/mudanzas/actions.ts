"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";

const STATUSES = ["requested", "confirmed", "completed", "cancelled"];

export async function setBookingStatus(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!STATUSES.includes(status)) return;
  await supabase.from("bookings").update({ status }).eq("id", id);
  revalidatePath("/admin/mudanzas");
}

export async function blockDay(formData: FormData) {
  const { supabase } = await requireAdmin();
  const day = String(formData.get("day"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  await supabase.from("blocked_dates").upsert({ day, reason: String(formData.get("reason") ?? "") || null });
  revalidatePath("/admin/mudanzas");
}

export async function unblockDay(formData: FormData) {
  const { supabase } = await requireAdmin();
  await supabase.from("blocked_dates").delete().eq("day", String(formData.get("day")));
  revalidatePath("/admin/mudanzas");
}
