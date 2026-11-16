import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Todo menos archivos estáticos, imágenes, el webhook de pagos y lo que leen buscadores y catálogos
    "/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest|robots.txt|sitemap.xml|feeds/|og$|api/mercadopago|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
