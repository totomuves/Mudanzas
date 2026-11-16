import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";
import { getPublicCatalog } from "@/lib/marketing/catalog";

// Se rehace cada hora con los productos disponibles
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const { products, categories } = await getPublicCatalog();
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/catalogo`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/descubrir`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    ...["/envios", "/devoluciones", "/contacto", "/retiramos", "/terminos", "/privacidad"].map((path) => ({
      url: `${base}${path}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.3,
    })),
    ...categories.map((c) => ({
      url: `${base}/catalogo?categoria=${encodeURIComponent(c.slug)}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...products.map((p) => ({
      url: `${base}/producto/${p.id}`,
      lastModified: new Date(p.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.7,
      images: p.images.slice(0, 3),
    })),
  ];
}
