import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { canUseProductTools } from "@/lib/admin-api";
import { getCategories } from "@/lib/data";
import { SUPABASE_URL } from "@/lib/env";

/**
 * Mira la foto de un producto y sugiere título, descripción, categoría,
 * estado y precio en pesos chilenos. Solo admins y vendedores aprobados. Requiere ANTHROPIC_API_KEY.
 */
export async function POST(request: NextRequest) {
  if (!(await canUseProductTools())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Falta ANTHROPIC_API_KEY" }, { status: 400 });
  }

  const { imageUrl } = (await request.json().catch(() => ({}))) as { imageUrl?: string };
  // Solo fotos de nuestro propio Storage
  if (!imageUrl || !SUPABASE_URL || !imageUrl.startsWith(`${SUPABASE_URL}/storage/v1/object/public/products/`)) {
    return NextResponse.json({ error: "Foto inválida" }, { status: 400 });
  }

  const categories = await getCategories();
  const slugs = categories.map((c) => c.slug) as [string, ...string[]];

  const Suggestion = z.object({
    title: z.string().describe("Título corto y atractivo, máx. 60 caracteres, con marca/modelo si se ve"),
    description: z.string().describe("2 a 4 frases: qué es, medidas o capacidad aproximadas si se deducen, estado visible"),
    category_slug: z.enum(slugs),
    condition: z.enum(["nuevo", "como_nuevo", "buen_estado", "con_detalles"]),
    price: z.number().int().describe("Precio de venta sugerido en CLP para un artículo usado en Chile"),
    original_price: z.number().int().nullable().describe("Precio aproximado nuevo en CLP, o null si no se puede estimar"),
  });

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(Suggestion) },
      system:
        "Eres el asistente de una tienda chilena de artículos de segunda mano que vienen de mudanzas. " +
        "Escribes en español de Chile, claro y honesto, sin exagerar. " +
        `Categorías disponibles: ${categories.map((c) => `${c.slug} (${c.name})`).join(", ")}. ` +
        "Los precios de venta suelen ser entre 20% y 50% del precio nuevo según el estado.",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: imageUrl } },
            { type: "text", text: "Sugiere los datos para publicar este producto." },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return NextResponse.json({ error: "No pudimos analizar esta foto" }, { status: 422 });
    }
    return NextResponse.json(response.parsed_output);
  } catch (e) {
    console.error("[sugerir]", e);
    return NextResponse.json({ error: "La IA no respondió, intenta de nuevo" }, { status: 502 });
  }
}
