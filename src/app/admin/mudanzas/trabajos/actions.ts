"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/admin";

export type WorkState = { ok?: string; error?: string };

const STORAGE_PREFIX = "/storage/v1/object/public/products/";
const FALTA_TABLA = "Falta crear la tabla: corre la migración 20261116130000_trabajos_mudanzas.sql en Supabase.";

function text(formData: FormData, name: string, max: number) {
  return String(formData.get(name) ?? "").trim().slice(0, max);
}

/** Ruta dentro del bucket (solo fotos de trabajos/) */
function workPath(url: string | null) {
  if (!url) return null;
  const i = url.indexOf(STORAGE_PREFIX);
  if (i < 0) return null;
  const path = decodeURIComponent(url.slice(i + STORAGE_PREFIX.length).split("?")[0]);
  return path.startsWith("trabajos/") ? path : null;
}

function refresh() {
  revalidatePath("/mudanzas/conocenos");
  revalidatePath("/admin/mudanzas/trabajos");
}

export async function addWork(_prev: WorkState, formData: FormData): Promise<WorkState> {
  const { supabase } = await requireSection("mudanzas");
  const imageUrl = text(formData, "image_url", 500);
  if (!imageUrl) return { error: "Sube una foto." };
  const { data: last } = await supabase
    .from("moving_works")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("moving_works").insert({
    image_url: imageUrl,
    title: text(formData, "title", 80) || null,
    caption: text(formData, "caption", 140) || null,
    sort_order: (last?.sort_order ?? -1) + 1,
  });
  if (error) return { error: error.code === "42P01" || error.code === "PGRST205" ? FALTA_TABLA : "No se pudo guardar. Intenta de nuevo." };
  refresh();
  return { ok: "Foto agregada." };
}

export async function toggleWork(formData: FormData) {
  const { supabase } = await requireSection("mudanzas");
  await supabase.from("moving_works").update({ active: formData.get("active") === "1" }).eq("id", String(formData.get("id")));
  refresh();
}

export async function deleteWork(formData: FormData) {
  const { supabase } = await requireSection("mudanzas");
  const id = String(formData.get("id"));
  const { data } = await supabase.from("moving_works").select("image_url").eq("id", id).maybeSingle();
  await supabase.from("moving_works").delete().eq("id", id);
  const path = workPath(data?.image_url ?? null);
  if (path) await supabase.storage.from("products").remove([path]);
  refresh();
}

/** Sube o baja una foto en el orden de la galería (la primera sale grande). */
export async function moveWork(formData: FormData) {
  const { supabase } = await requireSection("mudanzas");
  const id = String(formData.get("id"));
  const dir = formData.get("dir") === "up" ? -1 : 1;
  const { data } = await supabase.from("moving_works").select("id, sort_order").order("sort_order").order("created_at");
  const list = data ?? [];
  const i = list.findIndex((w) => w.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await Promise.all(
    list.map((w, idx) => (w.sort_order === idx ? null : supabase.from("moving_works").update({ sort_order: idx }).eq("id", w.id))),
  );
  refresh();
}
