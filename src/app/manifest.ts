import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/env";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: "Tesoros que quedan en las mudanzas, a precios bajísimos.",
    start_url: "/descubrir",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fff8f1",
    theme_color: "#ff6b3d",
    lang: "es-CL",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
