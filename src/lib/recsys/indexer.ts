import "server-only";
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONDITION_LABEL } from "@/lib/format";
import type { Product } from "@/lib/types";
import { activeModel, embed, toPgVector } from "./embeddings";
import { COLORS, MATERIALS, ROOMS, SIZES, STYLES, keywordAttributes, type ProductAttributes } from "./text";

/**
 * Analiza productos para el recomendador:
 *   1) atributos (estilo, material, color, espacio, tamaño) — con Claude mirando
 *      la foto si hay ANTHROPIC_API_KEY, o por palabras clave si no.
 *   2) la huella (embedding) del producto.
 * Guarda todo en product_features. Es seguro llamarlo muchas veces:
 * solo trabaja con productos nuevos o que cambiaron.
 */

const Attrs = z.object({
  styles: z.array(z.enum(STYLES)).max(2).describe("Estilo decorativo, solo si es claro"),
  materials: z.array(z.enum(MATERIALS)).max(3),
  colors: z.array(z.enum(COLORS)).max(3).describe("Colores principales"),
  rooms: z.array(z.enum(ROOMS)).max(3).describe("Espacios de la casa donde se usa"),
  size: z.enum(SIZES).describe("Tamaño comparado con otros de su tipo; pequeño = cabe en un depto chico"),
  tags: z.array(z.string()).max(6).describe("Palabras que un comprador buscaría: tipo de objeto, marca, uso. En minúsculas, español de Chile"),
});

async function aiAttributes(p: Product, categoryName: string): Promise<ProductAttributes | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const image = p.images[0];
  const client = new Anthropic();
  try {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (image) content.push({ type: "image", source: { type: "url", url: image } });
    content.push({
      type: "text",
      text: `Producto: ${p.title}\nCategoría: ${categoryName}\nDescripción: ${p.description || "(sin descripción)"}\n\nDescribe sus atributos.`,
    });
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(Attrs) },
      system:
        "Clasificas artículos de segunda mano de una tienda chilena para un recomendador. " +
        "Usa solo lo que se ve en la foto o se dice en el texto; si un atributo no es claro, deja la lista vacía.",
      messages: [{ role: "user", content }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) return null;
    const a = response.parsed_output;
    return { ...a, tags: a.tags.map((t) => t.toLowerCase().trim()).filter(Boolean) };
  } catch (e) {
    console.error("[recomendador] atributos con IA", e);
    return null;
  }
}

function featureText(p: Product, categoryName: string, a: ProductAttributes) {
  return [
    `${p.title}`,
    `Categoría: ${categoryName}`,
    a.styles.length ? `Estilo: ${a.styles.join(", ")}` : "",
    a.materials.length ? `Material: ${a.materials.join(", ")}` : "",
    a.colors.length ? `Color: ${a.colors.join(", ")}` : "",
    a.rooms.length ? `Espacio: ${a.rooms.join(", ")}` : "",
    a.size ? `Tamaño: ${a.size}` : "",
    a.tags.length ? `Etiquetas: ${a.tags.join(", ")}` : "",
    `Estado: ${CONDITION_LABEL[p.condition] ?? p.condition}`,
    p.description,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Igual que public.product_content_hash en la base de datos (concat_ws omite los nulos). */
export function contentHash(p: Product) {
  const parts = [p.title, p.description, p.category_slug, p.condition, p.images[0]].filter((x) => x != null);
  return crypto.createHash("md5").update(parts.join("|")).digest("hex");
}

export async function indexProduct(p: Product, categoryName: string, model = activeModel()) {
  const db = createAdminClient();
  const hashRow = contentHash(p);
  const existing = await db.from("product_features").select("attributes, content_hash").eq("product_id", p.id).maybeSingle();

  // Si solo cambió el modelo de huellas, se reutilizan los atributos (no se paga IA de nuevo)
  let attrs: ProductAttributes | null =
    existing.data && existing.data.content_hash === hashRow ? (existing.data.attributes as ProductAttributes) : null;
  if (!attrs) {
    attrs =
      (await aiAttributes(p, categoryName)) ??
      keywordAttributes(`${p.title} ${categoryName} ${p.description}`);
  }

  const vec = await embed(featureText(p, categoryName, attrs), { imageUrl: p.images[0], kind: "document" });
  const { error } = await db.from("product_features").upsert({
    product_id: p.id,
    attributes: attrs,
    embedding: toPgVector(vec),
    model,
    content_hash: hashRow,
    indexed_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Analiza hasta `limit` productos pendientes (o los ids indicados). */
export async function indexPending(opts: { ids?: string[]; limit?: number } = {}) {
  const db = createAdminClient();
  const model = activeModel();

  // Si cambió el proveedor de huellas, se anota y se recalcula todo de a poco
  const { data: cfg } = await db.from("recsys_config").select("embedding_model").eq("id", 1).maybeSingle();
  if (cfg && cfg.embedding_model !== model) {
    await db.from("recsys_config").update({ embedding_model: model, updated_at: new Date().toISOString() }).eq("id", 1);
  }

  const { data: cats } = await db.from("categories").select("slug, name");
  const catName = Object.fromEntries((cats ?? []).map((c) => [c.slug, c.name])) as Record<string, string>;

  let products: Product[];
  if (opts.ids?.length) {
    const { data } = await db.from("products").select("*").in("id", opts.ids.slice(0, 20));
    products = (data ?? []) as Product[];
  } else {
    const { data, error } = await db.rpc("products_to_index", { p_limit: opts.limit ?? 8, p_model: model });
    if (error) throw error;
    products = (data ?? []) as Product[];
  }

  let done = 0;
  const failed: string[] = [];
  for (const p of products) {
    try {
      await indexProduct(p, catName[p.category_slug] ?? p.category_slug, model);
      done++;
    } catch (e) {
      console.error("[recomendador] no se pudo analizar", p.id, e);
      failed.push(p.id);
    }
  }
  return { done, failed, model };
}

/** Huella de una búsqueda (para aprender de lo que la gente busca). */
export async function embedQuery(q: string) {
  return { vector: toPgVector(await embed(q, { kind: "query" })), model: activeModel() };
}
