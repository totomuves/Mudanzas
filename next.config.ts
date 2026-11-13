import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La app es muy dinámica (sesión, feed personalizado), así que usamos el
  // modelo de render por request clásico en vez de Cache Components.
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
