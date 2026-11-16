/**
 * MARKETING: identificadores de Google, Meta (Facebook/Instagram) y TikTok.
 * Se pegan como variables de entorno en Vercel (ver la guía de marketing).
 * Si una variable falta, esa herramienta simplemente no se carga.
 */

function clean(value: string | undefined, pattern: RegExp) {
  const v = (value ?? "").trim();
  return pattern.test(v) ? v : "";
}

export const tracking = {
  /** Google Analytics 4: "G-XXXXXXXXXX" */
  gaId: clean(process.env.NEXT_PUBLIC_GA_ID, /^G-[A-Z0-9]{4,20}$/),
  /** Google Ads (opcional, para medir campañas): "AW-123456789" */
  googleAdsId: clean(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID, /^AW-\d{5,15}$/),
  /** Meta Pixel (Facebook + Instagram): solo números */
  metaPixelId: clean(process.env.NEXT_PUBLIC_META_PIXEL_ID, /^\d{10,20}$/),
  /** TikTok Pixel: letras mayúsculas y números */
  tiktokPixelId: clean(process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID, /^[A-Z0-9]{10,30}$/),
};

/** Hay al menos una herramienta de medición configurada (si no, no se pide consentimiento). */
export const anyTracking = Boolean(
  tracking.gaId || tracking.googleAdsId || tracking.metaPixelId || tracking.tiktokPixelId,
);

/** Códigos para verificar que el dominio es tuyo (etiqueta meta en el <head>). */
export const siteVerification = {
  google: (process.env.GOOGLE_SITE_VERIFICATION ?? "").trim(),
  meta: (process.env.META_DOMAIN_VERIFICATION ?? "").trim(),
};

/** Redes sociales de la marca (se informan a Google y se muestran en el sitio). */
export const socialLinks = [
  { name: "Instagram", url: process.env.NEXT_PUBLIC_INSTAGRAM_URL },
  { name: "TikTok", url: process.env.NEXT_PUBLIC_TIKTOK_URL },
  { name: "Facebook", url: process.env.NEXT_PUBLIC_FACEBOOK_URL },
].filter((s): s is { name: string; url: string } => Boolean(s.url && /^https:\/\//.test(s.url)));

/** Secciones privadas: no se miden ni se muestran a buscadores. */
export const PRIVATE_PATHS = [
  "/admin",
  "/vendedor",
  "/reparto",
  "/api",
  "/auth",
  "/cuenta",
  "/ingresar",
  "/recuperar",
  "/bienvenida",
  "/carrito",
  "/comprar",
  "/compra",
  "/pedido",
  "/mis-pedidos",
  "/mis-gustos",
  "/favoritos",
  "/avisos",
];

/** Secciones internas del equipo: no se mide nada ahí para no ensuciar los datos. */
export function isStaffPath(pathname: string) {
  return /^\/(admin|vendedor|reparto)(\/|$)/.test(pathname);
}
