"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMUNAS } from "@/lib/comunas";
import { getMarketplaceEnabled } from "@/lib/seller";
import type { Seller } from "@/lib/types";

export type SellerFormState = { ok?: string; error?: string };

const MAX_LOGO = 2 * 1024 * 1024;
const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Lee y valida los campos comunes del formulario de tienda. */
function readSellerFields(formData: FormData) {
  const str = (k: string, max: number) => String(formData.get(k) ?? "").trim().slice(0, max);
  const fields = {
    name: str("name", 80),
    kind: formData.get("kind") === "empresa" ? ("empresa" as const) : ("persona" as const),
    rut: str("rut", 20) || null,
    contact_name: str("contact_name", 80) || null,
    email: str("email", 120).toLowerCase(),
    phone: str("phone", 30),
    description: str("description", 600),
    comunas: formData
      .getAll("comunas")
      .map(String)
      .filter((c) => COMUNAS.includes(c)),
    bank_holder_name: str("bank_holder_name", 80) || null,
    bank_holder_rut: str("bank_holder_rut", 20) || null,
    bank_name: str("bank_name", 60) || null,
    bank_account_type: (["corriente", "vista", "ahorro", "rut"] as const).find((t) => t === formData.get("bank_account_type")) ?? null,
    bank_account_number: str("bank_account_number", 30) || null,
  };
  if (fields.name.length < 2) return { error: "Escribe el nombre de la empresa o tu nombre." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) return { error: "Revisa el correo de contacto." };
  if (fields.phone.replace(/\D/g, "").length < 8) return { error: "Escribe un teléfono o WhatsApp de contacto." };
  return { fields };
}

/** Sube el logo (si viene) a sellers/<id>/ y devuelve su URL pública. */
async function uploadLogo(sellerId: string, formData: FormData) {
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { url: undefined };
  const ext = LOGO_TYPES[file.type];
  if (!ext) return { error: "El logo debe ser PNG, JPG o WEBP." };
  if (file.size > MAX_LOGO) return { error: "El logo pesa más de 2 MB. Prueba con uno más liviano." };
  const db = createAdminClient();
  const path = `sellers/${sellerId}/logo-${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from("products").upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
  });
  if (error) return { error: "No pudimos subir el logo. Intenta de nuevo." };
  return { url: db.storage.from("products").getPublicUrl(path).data.publicUrl };
}

/** Registro: crea la tienda en estado "En revisión". */
export async function registerSeller(_prev: SellerFormState, formData: FormData): Promise<SellerFormState> {
  const { user } = await getUser();
  if (!user || user.is_anonymous) return { error: "Primero ingresa con tu correo." };
  if (!(await getMarketplaceEnabled())) return { error: "Por ahora no estamos recibiendo vendedores." };
  if (formData.get("terms") !== "on") return { error: "Debes aceptar las condiciones para vender." };

  const parsed = readSellerFields(formData);
  if ("error" in parsed) return { error: parsed.error };

  const db = createAdminClient();
  const { data: existing } = await db.from("sellers").select("id").eq("owner_id", user.id).maybeSingle();
  if (existing) redirect("/vendedor");

  const { data: seller, error } = await db
    .from("sellers")
    .insert({ ...parsed.fields, owner_id: user.id, status: "pending" })
    .select("id")
    .single();
  if (error || !seller) {
    console.error("[vender]", error);
    return { error: "No pudimos registrar tu tienda. Intenta de nuevo." };
  }

  const logo = await uploadLogo(seller.id, formData);
  if (logo.url) await db.from("sellers").update({ logo_url: logo.url }).eq("id", seller.id);

  redirect("/vendedor");
}

/** El vendedor edita los datos de su tienda (en cualquier estado). */
export async function updateMySeller(_prev: SellerFormState, formData: FormData): Promise<SellerFormState> {
  const { user } = await getUser();
  if (!user || user.is_anonymous) return { error: "Tu sesión expiró. Vuelve a ingresar." };

  const db = createAdminClient();
  const { data: seller } = await db.from("sellers").select("*").eq("owner_id", user.id).maybeSingle<Seller>();
  if (!seller) return { error: "No encontramos tu tienda." };

  const parsed = readSellerFields(formData);
  if ("error" in parsed) return { error: parsed.error };

  const logo = await uploadLogo(seller.id, formData);
  if (logo.error) return { error: logo.error };

  const update: Partial<Seller> = { ...parsed.fields };
  if (logo.url) update.logo_url = logo.url;
  if (formData.get("remove_logo") === "on") update.logo_url = null;
  // Una tienda rechazada que corrige sus datos vuelve a revisión
  if (seller.status === "rejected") update.status = "pending";

  const { error } = await db.from("sellers").update(update).eq("id", seller.id);
  if (error) return { error: "No se pudo guardar. Intenta de nuevo." };

  // Borra el logo anterior si se reemplazó o quitó
  if (seller.logo_url && update.logo_url !== undefined && update.logo_url !== seller.logo_url) {
    const marker = "/storage/v1/object/public/products/";
    const i = seller.logo_url.indexOf(marker);
    if (i >= 0) await db.storage.from("products").remove([decodeURIComponent(seller.logo_url.slice(i + marker.length))]);
  }

  revalidatePath("/vendedor", "layout");
  return { ok: seller.status === "rejected" ? "Listo. Enviamos tu tienda de nuevo a revisión." : "Datos guardados." };
}
