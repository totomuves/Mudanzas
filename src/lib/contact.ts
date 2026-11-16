import "server-only";
import { brand } from "@/brand";
import { hasSupabaseEnv } from "@/lib/env";
import { getMovingData } from "@/lib/data";

/** Datos de contacto públicos: los de src/brand.ts y, si falta el WhatsApp, el del admin. */
export async function getContact() {
  let whatsapp = brand.legal.whatsapp;
  if (!whatsapp && hasSupabaseEnv()) {
    whatsapp = (await getMovingData().catch(() => null))?.settings?.whatsapp ?? "";
  }
  const digits = whatsapp.replace(/\D/g, "");
  return {
    ...brand.legal,
    whatsapp,
    whatsappUrl: digits.length >= 8 ? `https://wa.me/${digits}` : null,
    owner: brand.legal.companyName || brand.name,
  };
}
