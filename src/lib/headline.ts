import { getPhrase } from "@/lib/phrases";
import { getPickForYou, type PickForYou } from "@/lib/pick-for-you";

export type Headline = { text: string; pick: PickForYou | null };

/** Temas que se reconocen en una frase de portada → categoría del producto a sugerir. */
const TOPICS: [RegExp, string][] = [
  [/\b(cama|colchon|pieza|dormir|duerme)/, "dormitorio"],
  [/\b(sofa|sillon|silla|mueble|rincon)/, "muebles"],
  [/\b(cocina|olla|chef|arroz)/, "cocina"],
  [/\b(lavadora|refri|electro|enchuf|watts)/, "electro"],
  [/\b(celular|pantalla|tech|gadget|pulgadas)/, "tecnologia"],
  [/\b(cuadro|pared|decora|plantas)/, "deco"],
  [/\b(guagua|juguete|ninos|hijos)/, "ninos"],
  [/\b(bicicleta|pesas|pedale|gimnasio|deporte)/, "deporte"],
  [/\b(libro|novela|vinilo|leer|musica)/, "libros"],
  [/\b(taladro|herramienta|chasquilla)/, "herramientas"],
  [/\b(ropa|chaqueta|closet|prenda|moda)/, "ropa"],
  [/\b(perro|gato|mascota|peludo)/, "mascotas"],
];

export function phraseTopic(text: string): string | null {
  const t = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return TOPICS.find(([re]) => re.test(t))?.[1] ?? null;
}

/**
 * Frase del título + producto que la acompaña (con link), elegido por el
 * recomendador según los gustos del comprador y relacionado con la frase:
 * - En una categoría: frase y producto de esa categoría.
 * - En la portada: la mitad de las veces se parte del producto que más le
 *   gustaría y se elige una frase de su categoría; la otra mitad sale una frase
 *   general y, si habla de algo (sofá, cama, cocina…), el producto es de eso.
 */
export async function getHeadline(category?: string, fallback?: string): Promise<Headline> {
  if (category) {
    const [text, pick] = await Promise.all([getPhrase(category, fallback), getPickForYou(category)]);
    return { text, pick };
  }
  if (Math.random() < 0.5) {
    const pick = await getPickForYou();
    if (pick) return { text: await getPhrase(pick.product.category_slug, fallback), pick };
  }
  const text = await getPhrase(undefined, fallback);
  const topic = phraseTopic(text);
  const pick = (topic ? await getPickForYou(topic) : null) ?? (await getPickForYou());
  return { text, pick };
}
