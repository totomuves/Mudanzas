import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Todo menos archivos estáticos, imágenes y el webhook de pagos
    "/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest|api/mercadopago|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
