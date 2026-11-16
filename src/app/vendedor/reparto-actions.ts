"use server";

import { revalidatePath } from "next/cache";
import { requireSeller } from "@/lib/seller";
import {
  assignDriverFor, deleteVehicleFor, moveOrderFor, planFor, publishFor, reoptimizeFor, saveSettingsFor, saveVehicleFor,
  type FormState, type PlanState,
} from "@/lib/routing/manage";

/** Reparto propio del vendedor: el chofer es la persona dueña de la tienda. */
async function seller() {
  const { seller, user } = await requireSeller();
  return { id: seller.id, drivers: [user.id] };
}

export async function sellerSaveSettings(_prev: FormState, f: FormData): Promise<FormState> {
  const s = await seller();
  const r = await saveSettingsFor(s.id, f);
  revalidatePath("/vendedor/reparto", "layout");
  return r;
}

export async function sellerSaveVehicle(_prev: FormState, f: FormData): Promise<FormState> {
  const s = await seller();
  const r = await saveVehicleFor(s.id, f, s.drivers);
  revalidatePath("/vendedor/reparto/ajustes");
  return r;
}

export async function sellerDeleteVehicle(f: FormData) {
  const s = await seller();
  await deleteVehicleFor(s.id, String(f.get("id") ?? ""));
  revalidatePath("/vendedor/reparto/ajustes");
}

export async function sellerPlanDay(_prev: PlanState, f: FormData): Promise<PlanState> {
  const s = await seller();
  const r = await planFor(s.id, f);
  revalidatePath("/vendedor/reparto");
  return r;
}

export async function sellerPublish(f: FormData) {
  const s = await seller();
  await publishFor(s.id, f);
  revalidatePath("/vendedor/reparto");
}

export async function sellerAssignDriver(f: FormData) {
  const s = await seller();
  await assignDriverFor(s.id, f, s.drivers);
  revalidatePath("/vendedor/reparto");
}

export async function sellerReoptimize(f: FormData) {
  const s = await seller();
  await reoptimizeFor(s.id, f);
  revalidatePath("/vendedor/reparto");
}

export async function sellerMoveOrder(f: FormData) {
  const s = await seller();
  await moveOrderFor(s.id, f);
  revalidatePath("/vendedor/reparto");
}
