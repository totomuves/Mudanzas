"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/admin";

export type ServiceState = { ok?: string; error?: string };

function refresh() {
  revalidatePath("/admin/mudanzas/servicios");
  revalidatePath("/mudanzas", "layout");
}

/** "Depto 1–2 dormitorios" → "depto-1-2-dormitorios" */
function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export async function saveService(_prev: ServiceState, f: FormData): Promise<ServiceState> {
  const { supabase } = await requireSection("mudanzas");
  const slug = String(f.get("slug") ?? "").trim();
  const name = String(f.get("name") ?? "").trim().slice(0, 60);
  const description = String(f.get("description") ?? "").trim().slice(0, 200);
  const includes = String(f.get("includes") ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-•*]\s*/, "").trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 10);
  const base_price = parseInt(String(f.get("base_price") ?? "").replace(/\D/g, ""), 10);
  const crew_size = parseInt(String(f.get("crew_size") ?? ""), 10);
  const est_hours = Number(String(f.get("est_hours") ?? "").replace(",", "."));

  if (name.length < 2) return { error: "Escribe el nombre del servicio." };
  if (!Number.isFinite(base_price) || base_price < 0) return { error: "Escribe el precio." };
  if (!Number.isFinite(crew_size) || crew_size < 1 || crew_size > 20) return { error: "Las personas deben ser entre 1 y 20." };
  if (!Number.isFinite(est_hours) || est_hours <= 0 || est_hours > 99) return { error: "Revisa las horas estimadas." };

  const row = { name, description, includes, base_price, crew_size, est_hours: Math.round(est_hours * 10) / 10, active: f.get("active") === "on" };

  if (slug) {
    const { error } = await supabase.from("service_types").update(row).eq("slug", slug);
    if (error) return { error: "No se pudo guardar. Intenta de nuevo." };
    refresh();
    return { ok: "Cambios guardados." };
  }

  // Servicio nuevo: el código se arma con el nombre, sin repetir uno existente
  const { data: all } = await supabase.from("service_types").select("slug, sort_order");
  const taken = new Set((all ?? []).map((s) => s.slug));
  const base = slugify(name) || "servicio";
  let newSlug = base;
  for (let i = 2; taken.has(newSlug); i++) newSlug = `${base}-${i}`;
  const sort_order = Math.max(-1, ...(all ?? []).map((s) => s.sort_order)) + 1;

  const { error } = await supabase.from("service_types").insert({ ...row, slug: newSlug, sort_order });
  if (error) return { error: "No se pudo crear el servicio. Intenta de nuevo." };
  refresh();
  return { ok: "Servicio creado." };
}

/** Sube o baja un servicio en la lista de precios. */
export async function moveService(f: FormData) {
  const { supabase } = await requireSection("mudanzas");
  const slug = String(f.get("slug"));
  const dir = f.get("dir") === "up" ? -1 : 1;
  const { data } = await supabase.from("service_types").select("slug, sort_order").order("sort_order").order("slug");
  const list = data ?? [];
  const i = list.findIndex((s) => s.slug === slug);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await Promise.all(
    list.map((s, idx) => (s.sort_order === idx ? null : supabase.from("service_types").update({ sort_order: idx }).eq("slug", s.slug))),
  );
  refresh();
}
