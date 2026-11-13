import "server-only";
import { canonical, tokens } from "./text";

/**
 * "Huellas" (embeddings) de 512 números para medir qué tan parecidos son
 * productos y gustos. Elige el proveedor según las variables de entorno:
 *
 *   EMBEDDINGS_PROVIDER = gemini | openai | jina | local   (opcional; si no, se detecta)
 *   GEMINI_API_KEY   -> Google Gemini (tiene nivel gratuito) — recomendado
 *   OPENAI_API_KEY   -> OpenAI text-embedding-3-small (muy barato)
 *   JINA_API_KEY     -> Jina CLIP v2 (entiende también la FOTO)
 *
 * Sin ninguna clave usa "local": una huella por palabras que funciona gratis
 * y sin internet (menos fina, pero el recomendador sigue funcionando).
 */

export const DIMS = 512;

export type Provider = "gemini" | "openai" | "jina" | "local";

export function activeProvider(): Provider {
  const forced = process.env.EMBEDDINGS_PROVIDER?.toLowerCase() as Provider | undefined;
  if (forced === "local") return "local";
  if (forced === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (forced === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (forced === "jina" && process.env.JINA_API_KEY) return "jina";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.JINA_API_KEY) return "jina";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "local";
}

const MODEL_NAME: Record<Provider, string> = {
  gemini: "gemini-embedding-001",
  openai: "text-embedding-3-small",
  jina: "jina-clip-v2",
  local: "hash-v1",
};

/** Identificador guardado junto a cada huella: si cambia, se recalculan todas. */
export function activeModel() {
  const p = activeProvider();
  return `${p}:${MODEL_NAME[p]}:${DIMS}`;
}

export const PROVIDER_LABEL: Record<Provider, string> = {
  gemini: "Google Gemini",
  openai: "OpenAI",
  jina: "Jina CLIP (texto + foto)",
  local: "Local por palabras (gratis, sin clave)",
};

function unit(v: number[]) {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return n > 1e-9 ? v.map((x) => x / n) : v;
}

/** Huella para un texto (y opcionalmente una foto, si el proveedor la entiende). */
export async function embed(text: string, opts: { imageUrl?: string; kind?: "document" | "query" } = {}): Promise<number[]> {
  const provider = activeProvider();
  try {
    if (provider === "gemini") return unit(await gemini(text, opts.kind));
    if (provider === "openai") return unit(await openai(text));
    if (provider === "jina") return unit(await jina(text, opts.imageUrl));
  } catch (e) {
    // Mejor fallar ruidosamente: mezclar huellas de modelos distintos no sirve
    console.error(`[embeddings:${provider}]`, e);
    throw e;
  }
  return localEmbed(text);
}

async function gemini(text: string, kind: "document" | "query" = "document") {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent",
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        content: { parts: [{ text: text.slice(0, 6000) }] },
        taskType: kind === "query" ? "RETRIEVAL_QUERY" : "SEMANTIC_SIMILARITY",
        outputDimensionality: DIMS,
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { embedding?: { values?: number[] } };
  const v = json.embedding?.values;
  if (!v || v.length !== DIMS) throw new Error("Gemini devolvió una huella inválida");
  return v;
}

async function openai(text: string) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 6000), dimensions: DIMS }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { data?: { embedding: number[] }[] };
  const v = json.data?.[0]?.embedding;
  if (!v || v.length !== DIMS) throw new Error("OpenAI devolvió una huella inválida");
  return v;
}

async function jina(text: string, imageUrl?: string) {
  const input: ({ text: string } | { image: string })[] = [{ text: text.slice(0, 6000) }];
  if (imageUrl) input.push({ image: imageUrl });
  const res = await fetch("https://api.jina.ai/v1/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.JINA_API_KEY}` },
    body: JSON.stringify({ model: "jina-clip-v2", dimensions: DIMS, normalized: true, input }),
  });
  if (!res.ok) throw new Error(`Jina ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { data?: { embedding: number[] }[] };
  const vs = (json.data ?? []).map((d) => d.embedding).filter((v) => v?.length === DIMS);
  if (vs.length === 0) throw new Error("Jina devolvió una huella inválida");
  // Texto y foto viven en el mismo espacio: se promedian (60% foto si hay)
  if (vs.length === 1) return vs[0];
  return vs[0].map((x, i) => 0.4 * x + 0.6 * vs[1][i]);
}

/** FNV-1a de 32 bits */
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Huella local gratuita: palabras (con sinónimos), pares de palabras y
 * trozos de 4 letras repartidos en 512 casillas. Las palabras marcadas con
 * "peso" (categoría, estilo…) cuentan más.
 */
export function localEmbed(text: string): number[] {
  const v = new Array(DIMS).fill(0);
  const add = (feat: string, w: number) => {
    const h = hash(feat);
    v[h % DIMS] += (h & 0x80000000 ? -1 : 1) * w;
  };
  // Secciones "clave: valor" pesan más
  for (const line of text.split("\n")) {
    const weight = /^(categoría|estilo|material|espacio|tamaño|color|etiquetas)\b/i.test(line) ? 2 : 1;
    const ws = tokens(line).map(canonical);
    ws.forEach((w, i) => {
      add(`w:${w}`, 1.0 * weight);
      if (i > 0) add(`b:${ws[i - 1]}_${w}`, 0.5 * weight);
      if (w.length >= 5) for (let j = 0; j + 4 <= w.length; j++) add(`c:${w.slice(j, j + 4)}`, 0.25 * weight);
    });
  }
  return unit(v);
}

/** Formato que entiende pgvector: "[0.1,0.2,…]" */
export function toPgVector(v: number[]) {
  return `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : "0")).join(",")}]`;
}
