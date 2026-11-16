import { brand } from "@/brand";
import { siteUrl } from "@/lib/env";
import { feedable, feedItem, getPublicCatalog } from "@/lib/marketing/catalog";

/**
 * Feed de productos (formato de Google Merchant Center).
 * Sirve tal cual para Google Shopping, el catálogo de Meta (Instagram y
 * Facebook Shops) y el catálogo de TikTok: se pega esta dirección en cada uno
 * y ellos la vuelven a leer solos cada día.
 *   https://<tu-dominio>/feeds/productos.xml
 */
export const dynamic = "force-dynamic";

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Caracteres de control que rompen el XML
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function tag(name: string, value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "" : `<${name}>${esc(String(value))}</${name}>`;
}

export async function GET() {
  const { products, categories } = await getPublicCatalog();
  const items = products
    .filter(feedable)
    .map((p) => feedItem(p, categories))
    .map(
      (i) =>
        "<item>" +
        tag("g:id", i.id) +
        tag("title", i.title) +
        tag("description", i.description) +
        tag("link", i.link) +
        tag("g:image_link", i.image) +
        i.extraImages.map((img) => tag("g:additional_image_link", img)).join("") +
        tag("g:availability", "in_stock") +
        tag("g:condition", i.condition) +
        tag("g:price", i.price) +
        tag("g:sale_price", i.salePrice) +
        tag("g:sale_price_effective_date", i.saleUntil) +
        tag("g:brand", i.brand) +
        tag("g:identifier_exists", "no") +
        tag("g:google_product_category", i.googleCategory) +
        tag("g:product_type", i.productType) +
        tag("g:quantity_to_sell_on_facebook", i.quantity) +
        "</item>",
    )
    .join("\n");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>` +
    tag("title", brand.name) +
    tag("link", siteUrl()) +
    tag("description", brand.description) +
    `\n${items}\n</channel></rss>\n`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
    },
  });
}
