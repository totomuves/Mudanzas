"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { completeStop, failStop, loadRoute, startRoute } from "@/lib/routing/operations";
import { reoptimizeRoute } from "@/lib/routing/planner";

type Here = { lat: number; lng: number } | null;
const point = (lat: unknown, lng: unknown): Here => {
  const a = Number(lat), b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && (a !== 0 || b !== 0) ? { lat: a, lng: b } : null;
};

export async function startRouteAction(routeId: string, lat?: number, lng?: number) {
  await startRoute(routeId, point(lat, lng));
  revalidatePath(`/reparto/${routeId}`);
}

export async function reoptimizeFromHere(routeId: string, lat?: number, lng?: number) {
  await loadRoute(routeId); // valida acceso
  const r = await reoptimizeRoute(routeId, point(lat, lng));
  revalidatePath(`/reparto/${routeId}`);
  return r.changed;
}

export type DeliverState = { error?: string };

export async function deliverAction(_prev: DeliverState, f: FormData): Promise<DeliverState> {
  const stopId = String(f.get("stopId") ?? "");
  const routeId = String(f.get("routeId") ?? "");
  const receivedBy = String(f.get("received_by") ?? "").trim().slice(0, 80);
  const rut = String(f.get("rut") ?? "").trim().slice(0, 14);
  if (receivedBy.length < 2) return { error: "Escribe el nombre de quien recibe." };
  const signature = f.get("signature");
  const photo = f.get("photo");
  const acc = Number(f.get("accuracy"));
  const here = point(f.get("lat"), f.get("lng"));
  const r = await completeStop(stopId, {
    receivedBy,
    rut,
    lat: here?.lat ?? null,
    lng: here?.lng ?? null,
    accuracy: Number.isFinite(acc) && acc > 0 ? acc : null,
    signature: signature as File,
    photo: photo instanceof File && photo.size > 0 ? photo : null,
  });
  if (!r.ok) return { error: r.error };
  revalidatePath(`/reparto/${routeId}`);
  redirect(`/reparto/${routeId}?entregado=${stopId}`);
}

export async function failAction(f: FormData) {
  const stopId = String(f.get("stopId") ?? "");
  const routeId = String(f.get("routeId") ?? "");
  const reason = String(f.get("reason") ?? "").trim().slice(0, 140) || "Sin motivo";
  await failStop(stopId, reason, point(f.get("lat"), f.get("lng")));
  revalidatePath(`/reparto/${routeId}`);
  redirect(`/reparto/${routeId}`);
}
