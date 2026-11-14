"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";

const FALTA_TABLA = "Falta crear la tabla de frases: corre la migración 20261114130000_frases_titulo.sql en Supabase.";

function refresh() {
  revalidatePath("/");
  revalidatePath("/catalogo");
  revalidatePath("/admin/portada");
}

const clean = (v: FormDataEntryValue | null) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, 120);

export async function addPhrase(formData: FormData) {
  const { supabase } = await requireAdmin();
  const text = clean(formData.get("text"));
  const category = String(formData.get("category") ?? "") || null;
  if (text.length < 2) return;
  const { error } = await supabase.from("site_phrases").insert({ text, category_slug: category });
  if (error) throw new Error(error.code === "42P01" ? FALTA_TABLA : "No se pudo guardar la frase.");
  refresh();
}

export async function updatePhrase(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const text = clean(formData.get("text"));
  if (!id || text.length < 2) return;
  await supabase.from("site_phrases").update({ text }).eq("id", id);
  refresh();
}

export async function togglePhrase(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await supabase.from("site_phrases").update({ active: formData.get("active") === "1" }).eq("id", id);
  refresh();
}

export async function deletePhrase(formData: FormData) {
  const { supabase } = await requireAdmin();
  await supabase.from("site_phrases").delete().eq("id", String(formData.get("id") ?? ""));
  refresh();
}
