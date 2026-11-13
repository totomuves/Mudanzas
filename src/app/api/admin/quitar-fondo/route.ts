import { NextResponse, type NextRequest } from "next/server";
import { canUseProductTools } from "@/lib/admin-api";

/** Quita el fondo con remove.bg y lo deja blanco. Solo admins y vendedores aprobados. */
export async function POST(request: NextRequest) {
  if (!(await canUseProductTools())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const key = process.env.REMOVE_BG_API_KEY;
  if (!key) return NextResponse.json({ error: "Falta REMOVE_BG_API_KEY" }, { status: 400 });

  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof Blob) || image.size > 12 * 1024 * 1024) {
    return NextResponse.json({ error: "Foto inválida" }, { status: 400 });
  }

  const body = new FormData();
  body.append("image_file", image, "foto.webp");
  body.append("size", "auto");
  body.append("bg_color", "ffffff");
  body.append("format", "jpg");
  body.append("crop", "true");
  body.append("crop_margin", "8%");
  body.append("scale", "original");

  const res = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: { "X-Api-Key": key },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[remove.bg]", res.status, detail.slice(0, 300));
    const msg = res.status === 402 ? "Se acabaron los créditos de remove.bg" : "remove.bg no pudo procesar la foto";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
  return new NextResponse(await res.arrayBuffer(), { headers: { "content-type": "image/jpeg" } });
}
