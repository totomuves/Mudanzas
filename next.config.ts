import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La app es muy dinámica (sesión, feed personalizado), así que usamos el
  // modelo de render por request clásico en vez de Cache Components.
  experimental: {
    // Logos de los vendedores (hasta 2 MB) se suben con una Server Action
    serverActions: { bodySizeLimit: "3mb" },
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
