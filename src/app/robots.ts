import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";
import { PRIVATE_PATHS } from "@/lib/marketing/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
