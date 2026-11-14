import { createClient } from "@/lib/supabase/server";

/**
 * Frases del título grande: las de la portada ("") y 3 por categoría.
 * Se editan en /admin/portada (tabla site_phrases). Estas son las que se usan
 * mientras no exista la tabla o si una categoría no tiene frases propias.
 * Regla: no mencionar mudanzas en los textos para compradores.
 */
export const DEFAULT_PHRASES: Record<string, string[]> = {
  "": [
    "Tu próximo regalón te está esperando.",
    "Cosas lindas, precios que no duelen.",
    "Desliza, enamórate, llévatelo.",
    "Estrena sin pagar precio de estreno.",
    "El sofá de tus sueños está a un swipe.",
    "Cachureo fino a precio de risa.",
    "Lo bueno vuela: cada pieza es única.",
    "Hoy es buen día para darse un gustito.",
  ],
  muebles: ["Ese rincón vacío ya tiene dueño.", "Siéntate, que esto se pone cómodo.", "Muebles con carácter, precios con cariño."],
  cocina: ["Tu cocina está pidiendo un upgrade.", "El chef que llevas dentro lo agradece.", "Para cocinar rico sin gastar de más."],
  electro: ["Enchúfalo y a disfrutar.", "Más watts, menos lucas.", "Electro que funciona, precios que encantan."],
  tecnologia: ["Lo último en tech, a precio de lo penúltimo.", "Pantallas, gadgets y otros vicios sanos.", "Tecnología al día sin vaciar la billetera."],
  dormitorio: ["Para dormir como guagua.", "Tu pieza merece un cariñito.", "Sueños grandes, precios chicos."],
  deco: ["Ese detalle que le faltaba a tu casa.", "Pequeños tesoros, gran efecto.", "Decora con estilo, paga con calma."],
  ninos: ["Crecen rápido: ahorra más rápido.", "Para los regalones de la casa.", "Juguetes y cosas de guagua casi nuevas."],
  deporte: ["La excusa perfecta para salir a pedalear.", "Equípate para la próxima aventura.", "Muévete sin gastar una fortuna."],
  libros: ["Historias buscando un nuevo lector.", "Música y libros con alma.", "Para leer, escuchar y volver a empezar."],
  herramientas: ["Para los maestros chasquilla.", "Arréglalo tú mismo, ahorra tú mismo.", "La herramienta que te faltaba, a precio justo."],
  ropa: ["Renueva tu clóset sin culpa.", "Estilo único, como cada prenda.", "Moda con historia y buen precio."],
  mascotas: ["Para los peludos de la casa.", "Tu mascota también merece un gustito.", "Camas, juguetes y mimos a buen precio."],
};

export type SitePhrase = { id: string; category_slug: string | null; text: string; active: boolean; sort_order: number };

const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];

/** Una frase al azar para la portada (sin categoría) o para una categoría. */
export async function getPhrase(category?: string, fallback?: string): Promise<string> {
  const defaults = DEFAULT_PHRASES[category ?? ""];
  try {
    const supabase = await createClient();
    let q = supabase.from("site_phrases").select("text").eq("active", true);
    q = category ? q.eq("category_slug", category) : q.is("category_slug", null);
    const { data, error } = await q;
    if (!error && data && data.length) return pick(data.map((d) => d.text as string));
  } catch {
    // sin tabla todavía: se usan las frases por defecto
  }
  return defaults?.length ? pick(defaults) : (fallback ?? DEFAULT_PHRASES[""][0]);
}
