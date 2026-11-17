"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/admin";
import { assignDriverFor, deleteRouteFor, moveOrderFor, planFor, publishFor, reoptimizeFor, type PlanState } from "@/lib/routing/manage";

const PATH = "/admin/despacho/rutas";

export async function planDay(_prev: PlanState, f: FormData): Promise<PlanState> {
  await requireSection("despacho");
  const r = await planFor(null, f);
  revalidatePath(PATH);
  return r;
}

export async function publishRoutes(f: FormData) {
  await requireSection("despacho");
  await publishFor(null, f);
  revalidatePath(PATH);
}

export async function assignDriver(f: FormData) {
  await requireSection("despacho");
  await assignDriverFor(null, f, null);
  revalidatePath(PATH);
}

export async function reoptimize(f: FormData) {
  await requireSection("despacho");
  await reoptimizeFor(null, f);
  revalidatePath(PATH);
}

export async function moveOrder(f: FormData) {
  await requireSection("despacho");
  await moveOrderFor(null, f);
  revalidatePath(PATH);
}

export async function deleteRoute(f: FormData) {
  await requireSection("despacho");
  await deleteRouteFor(null, f);
  revalidatePath(PATH);
}
