import { feedable, feedItem, getPublicCatalog } from "@/lib/marketing/catalog";

/**
 * El mismo catálogo en planilla CSV, por si Meta o TikTok piden ese formato.
 *   https://<tu-dominio>/feeds/productos.csv            (Meta / Facebook / Instagram)
 *   https://<tu-dominio>/feeds/productos.csv?para=tiktok (TikTok: la columna id se llama sku_id)
 */
export const dynamic = "force-dynamic";

function cell(value: string | number | null | undefined) {
  const v = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export async function GET(request: Request) {
  const tiktok = new URL(request.url).searchParams.get("para") === "tiktok";
  const { products, categories } = await getPublicCatalog();
  const header = [
    tiktok ? "sku_id" : "id",
    "title",
    "description",
    "availability",
    "condition",
    "price",
    "sale_price",
    "sale_price_effective_date",
    "link",
    "image_link",
    "additional_image_link",
    "brand",
    "google_product_category",
    "product_type",
    tiktok ? "inventory" : "quantity_to_sell_on_facebook",
  ];
  const rows = products
    .filter(feedable)
    .map((p) => feedItem(p, categories))
    .map((i) =>
      [
        i.id,
        i.title,
        i.description,
        "in stock",
        i.condition,
        i.price,
        i.salePrice,
        i.saleUntil,
        i.link,
        i.image,
        i.extraImages.join(","),
        i.brand,
        i.googleCategory,
        i.productType,
        i.quantity,
      ]
        .map(cell)
        .join(","),
    );
  return new Response([header.join(","), ...rows].join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
    },
  });
}
