"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { completePickup, completeStop, failStop, loadRoute, startRoute } from "@/lib/routing/operations";
import { reoptimizeRoute } from "@/lib/routing/planner";
import { savePosition, savePositionChecked } from "@/lib/routing/position";

type Here = { lat: number; lng: number } | null;
const point = (lat: unknown, lng: unknown): Here => {
  const a = Number(lat), b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && (a !== 0 || b !== 0) ? { lat: a, lng: b } : null;
};

export async function startRouteAction(routeId: string, lat?: number, lng?: number) {
  await startRoute(routeId, point(lat, lng));
  await savePosition(routeId, point(lat, lng));
  revalidatePath(`/reparto/${routeId}`);
}

export async function reoptimizeFromHere(routeId: string, lat?: number, lng?: number) {
  await loadRoute(routeId); // valida acceso
  const r = await reoptimizeRoute(routeId, point(lat, lng));
  await savePosition(routeId, point(lat, lng));
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
  await savePositionChecked(routeId, here);
  revalidatePath(`/reparto/${routeId}`);
  redirect(`/reparto/${routeId}?entregado=${stopId}`);
}

export async function failAction(f: FormData) {
  const stopId = String(f.get("stopId") ?? "");
  const routeId = String(f.get("routeId") ?? "");
  const reason = String(f.get("reason") ?? "").trim().slice(0, 140) || "Sin motivo";
  const here = point(f.get("lat"), f.get("lng"));
  await failStop(stopId, reason, here);
  await savePositionChecked(routeId, here);
  revalidatePath(`/reparto/${routeId}`);
  redirect(`/reparto/${routeId}`);
}

/** Retiro: fotos de lo que se recibe + firma de quien lo entrega, aceptando el texto. */
export async function pickupAction(_prev: DeliverState, f: FormData): Promise<DeliverState> {
  const stopId = String(f.get("stopId") ?? "");
  const routeId = String(f.get("routeId") ?? "");
  const donorName = String(f.get("donor_name") ?? "").trim().slice(0, 80);
  const rut = String(f.get("rut") ?? "").trim().slice(0, 14);
  if (donorName.length < 2) return { error: "Escribe el nombre de quien regala." };
  if (f.get("accept") !== "on") return { error: "Quien entrega debe aceptar el texto." };
  const acc = Number(f.get("accuracy"));
  const here = point(f.get("lat"), f.get("lng"));
  const r = await completePickup(stopId, {
    donorName,
    rut,
    lat: here?.lat ?? null,
    lng: here?.lng ?? null,
    accuracy: Number.isFinite(acc) && acc > 0 ? acc : null,
    signature: f.get("signature") as File,
    photos: f.getAll("photos").filter((x): x is File => x instanceof File && x.size > 0),
  });
  if (!r.ok) return { error: r.error };
  await savePositionChecked(routeId, here);
  revalidatePath(`/reparto/${routeId}`);
  redirect(`/reparto/${routeId}?retirado=${stopId}`);
}
