/**
 * Utilidades de texto para el recomendador: normalizar palabras en español
 * y reconocer estilos, materiales, colores, tamaños y espacios sin IA.
 */

export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ñ/g, "n");
}

const STOP = new Set(
  "de la el los las un una unos unas y o en con sin para por del al a se que su sus es muy mas tiene esta este esto como cm mts".split(" "),
);

/** "Sillones nórdicos" -> ["sillon", "nordico"] (raíz simple en español) */
export function tokens(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

export function stem(w: string) {
  if (w.length > 5 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
  return w;
}

// Sinónimos comunes en Chile -> una sola palabra
const SYNONYMS: Record<string, string> = {
  sillon: "sofa", futon: "sofa", living: "sofa", refri: "refrigerador", refrigerador: "refrigerador",
  nevera: "refrigerador", heladera: "refrigerador", lavaropa: "lavadora", notebook: "computador",
  laptop: "computador", pc: "computador", tele: "televisor", tv: "televisor", smart: "televisor",
  velador: "mesa_noche", comoda: "cajonera", closet: "ropero", armario: "ropero", cuna: "bebe",
  coche: "bebe", bici: "bicicleta", micro: "microonda", microondas: "microonda",
};
export function canonical(w: string) {
  return SYNONYMS[w] ?? w;
}

// Vocabulario controlado de atributos (lo usan la IA y el respaldo sin IA)
export const STYLES = ["nórdico", "moderno", "clásico", "rústico", "industrial", "vintage", "minimalista", "infantil", "boho", "gamer"] as const;
export const MATERIALS = ["madera", "metal", "vidrio", "plástico", "tela", "cuero", "mimbre", "mármol", "melamina"] as const;
export const COLORS = ["blanco", "negro", "gris", "beige", "café", "madera clara", "madera oscura", "azul", "verde", "rojo", "amarillo", "rosado", "multicolor"] as const;
export const ROOMS = ["living", "comedor", "cocina", "dormitorio", "baño", "oficina", "infantil", "exterior", "lavandería"] as const;
export const SIZES = ["pequeño", "mediano", "grande"] as const;

const KEYWORDS: { kind: "styles" | "materials" | "colors" | "rooms"; value: string; words: string[] }[] = [
  { kind: "styles", value: "nórdico", words: ["nordico", "escandinavo", "scandi"] },
  { kind: "styles", value: "moderno", words: ["moderno", "contemporaneo"] },
  { kind: "styles", value: "clásico", words: ["clasico", "antiguo", "estilo ingles", "colonial"] },
  { kind: "styles", value: "rústico", words: ["rustico", "campo", "rural"] },
  { kind: "styles", value: "industrial", words: ["industrial", "fierro"] },
  { kind: "styles", value: "vintage", words: ["vintage", "retro"] },
  { kind: "styles", value: "minimalista", words: ["minimalista", "simple"] },
  { kind: "styles", value: "gamer", words: ["gamer", "gaming"] },
  { kind: "materials", value: "madera", words: ["madera", "roble", "pino", "raulí", "rauli", "nogal", "lenga"] },
  { kind: "materials", value: "metal", words: ["metal", "metalico", "acero", "fierro", "aluminio"] },
  { kind: "materials", value: "vidrio", words: ["vidrio", "cristal"] },
  { kind: "materials", value: "plástico", words: ["plastico"] },
  { kind: "materials", value: "tela", words: ["tela", "tapiz", "lino", "terciopelo"] },
  { kind: "materials", value: "cuero", words: ["cuero", "eco cuero", "ecocuero"] },
  { kind: "materials", value: "mimbre", words: ["mimbre", "ratan", "rattan"] },
  { kind: "materials", value: "melamina", words: ["melamina", "aglomerado"] },
  { kind: "colors", value: "blanco", words: ["blanco", "blanca"] },
  { kind: "colors", value: "negro", words: ["negro", "negra"] },
  { kind: "colors", value: "gris", words: ["gris"] },
  { kind: "colors", value: "beige", words: ["beige", "crema", "arena"] },
  { kind: "colors", value: "café", words: ["cafe", "marron", "chocolate"] },
  { kind: "colors", value: "azul", words: ["azul", "celeste"] },
  { kind: "colors", value: "verde", words: ["verde"] },
  { kind: "rooms", value: "living", words: ["living", "sofa", "sillon", "mesa de centro", "rack"] },
  { kind: "rooms", value: "comedor", words: ["comedor", "silla", "mesa"] },
  { kind: "rooms", value: "cocina", words: ["cocina", "olla", "sarten", "microondas", "refrigerador", "horno"] },
  { kind: "rooms", value: "dormitorio", words: ["cama", "velador", "colchon", "ropero", "dormitorio", "comoda"] },
  { kind: "rooms", value: "oficina", words: ["escritorio", "silla de oficina", "ergonomica", "monitor", "oficina"] },
  { kind: "rooms", value: "infantil", words: ["cuna", "bebe", "nino", "nina", "infantil", "juguete"] },
  { kind: "rooms", value: "exterior", words: ["terraza", "jardin", "patio", "quitasol", "parrilla", "exterior"] },
];

export type ProductAttributes = {
  styles: string[];
  materials: string[];
  colors: string[];
  rooms: string[];
  size: string;
  tags: string[];
};

/** Detecta atributos por palabras clave (respaldo cuando no hay IA). */
export function keywordAttributes(text: string): ProductAttributes {
  const t = ` ${normalize(text)} `;
  const out: ProductAttributes = { styles: [], materials: [], colors: [], rooms: [], size: "", tags: [] };
  for (const k of KEYWORDS) {
    if (k.words.some((w) => t.includes(` ${normalize(w)}`)) && !out[k.kind].includes(k.value)) out[k.kind].push(k.value);
  }
  if (/\b(chic[oa]|pequen[oa]|mini|compact[oa])\b/.test(t)) out.size = "pequeño";
  else if (/\b(grande|king|familiar|3 cuerpos|amplio)\b/.test(t)) out.size = "grande";
  return out;
}
