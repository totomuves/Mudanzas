"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/admin";
import { deleteVehicleFor, saveSettingsFor, saveVehicleFor, type FormState } from "@/lib/routing/manage";

const PATH = "/admin/despacho/ajustes";

export async function saveDeliverySettings(_prev: FormState, f: FormData): Promise<FormState> {
  await requireSection("despacho");
  const r = await saveSettingsFor(null, f);
  revalidatePath("/admin/despacho", "layout");
  return r;
}

export async function saveVehicle(_prev: FormState, f: FormData): Promise<FormState> {
  await requireSection("despacho");
  const r = await saveVehicleFor(null, f, null);
  revalidatePath(PATH);
  return r;
}

export async function deleteVehicle(f: FormData) {
  await requireSection("despacho");
  await deleteVehicleFor(null, String(f.get("id") ?? ""));
  revalidatePath(PATH);
}
