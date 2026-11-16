import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La app es muy dinámica (sesión, feed personalizado), así que usamos el
  // modelo de render por request clásico en vez de Cache Components.
  experimental: {
    // Logos de vendedores y fotos de entregas y retiros se suben con Server Actions (Vercel acepta hasta 4,5 MB)
    serverActions: { bodySizeLimit: "4mb" },
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
