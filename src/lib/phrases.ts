import { createClient } from "@/lib/supabase/server";

/**
 * Frases del título grande: las de la portada ("") y 3 por categoría.
 * Se editan en /admin/portada (tabla site_phrases). Estas son las que se usan
 * mientras no exista la tabla o si una categoría no tiene frases propias.
 * Regla: no mencionar mudanzas en los textos para compradores.
 * Tono: humor chileno (sarcástico, negro, algo pícaro) pero siempre con respeto.
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
    "Sí, es usado. Tú también y nadie se queja.",
    "Precios tan bajos que vas a pensar que es estafa. No lo es.",
    "Tu billetera nos pidió que te diéramos las gracias.",
    "Comprar nuevo es tan 2019.",
    "Alguien lo regaló, tú lo pagas a precio de chiste. Todos ganan.",
    "No es cachureo si te salió barato y te queda bien.",
    "Más barato que tu último carrete.",
    "Precios que hacen llorar… a las grandes tiendas.",
    "Tranqui, nadie va a saber que te salió tan barato.",
    "Tu ex no va a volver, pero este sillón sí puede llegar.",
    "Sin letra chica. Lo único chico aquí es el precio.",
    "Todo es temporal. Estos precios, más todavía.",
    "Lo que a otro le sobraba, a ti te va a salvar el mes.",
    "Compra antes de que tu sueldo se entere.",
    "Tu tarjeta ya sufrió bastante. Aquí descansa.",
    "El dolor es inevitable. Pagar caro es opcional.",
    "Si el mundo se acaba mañana, que te pille con sofá nuevo.",
    "Nada dura para siempre. Por eso hay que aprovechar ahora.",
    "Usado, pero con experiencia. Como debe ser.",
    "Te va a gustar tanto que vas a querer repetir.",
    "Una vez que pruebas lo barato, no hay vuelta atrás.",
    "Desliza a la derecha: aquí el match sí llega a tu casa.",
    "Se mira, se toca… y te lo llevas.",
    "No importa el tamaño… importa el precio.",
    "Primera cita perfecta: barato, bonito y sin compromiso.",
    "Llévatelo a la pieza y después nos cuentas.",
    "Precios que arden, ofertas que no duran.",
    "Algunas cosas mejoran con los años. Estas, además, salen baratas.",
  ],
  muebles: [
    "Ese rincón vacío ya tiene dueño.",
    "Siéntate, que esto se pone cómodo.",
    "Muebles con carácter, precios con cariño.",
    "Este sillón ha visto cosas. Ahora quiere verte a ti.",
    "Tu espalda pide a gritos una silla decente.",
    "El mueble perfecto existe y no cuesta un riñón.",
    "Ya viene armado. Tu paciencia y tu pareja lo agradecen.",
    "Un sofá tan cómodo que vas a cancelar planes.",
  ],
  cocina: [
    "Tu cocina está pidiendo un upgrade.",
    "El chef que llevas dentro lo agradece.",
    "Para cocinar rico sin gastar de más.",
    "Hazlo en la cocina… cocinar, mal pensado.",
    "Ollas con experiencia: ya saben lo que hacen.",
    "Si se te quema el arroz, al menos la olla salió barata.",
    "Tu suegra no va a notar que fue barato.",
    "Cocina como chef. Lavar los platos sigue siendo cosa tuya.",
  ],
  electro: [
    "Enchúfalo y a disfrutar.",
    "Más watts, menos lucas.",
    "Electro que funciona, precios que encantan.",
    "Vibra, centrifuga y no se queja. La lavadora, obvio.",
    "Funciona. Lo probamos. Tranqui.",
    "Más barato que la cuenta de la luz de este mes.",
    "Un refri nuevo para guardar tus sobras con dignidad.",
    "Electro con más vida útil que tus propósitos de año nuevo.",
  ],
  tecnologia: [
    "Lo último en tech, a precio de lo penúltimo.",
    "Pantallas, gadgets y otros vicios sanos.",
    "Tecnología al día sin vaciar la billetera.",
    "Tu celular actual ya está pidiendo jubilación.",
    "La obsolescencia programada no vio venir estos precios.",
    "Pantalla grande, precio chico. Como debe ser.",
    "Más pulgadas por menos lucas.",
    "Tecnología de segunda mano, sonrisa de primera.",
  ],
  dormitorio: [
    "Para dormir como guagua.",
    "Tu pieza merece un cariñito.",
    "Sueños grandes, precios chicos.",
    "Lo que pase en esta cama es asunto tuyo. El precio, nuestro.",
    "Cama firme, precio blando.",
    "Para dormir… o para lo que se te ocurra.",
    "Duerme como guagua, paga como estudiante.",
    "Un colchón nuevo no arregla tu vida, pero ayuda harto.",
  ],
  deco: [
    "Ese detalle que le faltaba a tu casa.",
    "Pequeños tesoros, gran efecto.",
    "Decora con estilo, paga con calma.",
    "Tu casa no es fea, solo le falta cariño.",
    "Decora como influencer, paga como persona normal.",
    "Ese cuadro que va a hacer opinar a tus visitas.",
    "Porque las paredes desnudas no son tan sexys.",
    "Plantas que no vas a matar. Son de adorno, tranqui.",
  ],
  ninos: [
    "Crecen rápido: ahorra más rápido.",
    "Para los regalones de la casa.",
    "Juguetes y cosas de guagua casi nuevas.",
    "Lo usaron seis meses y se aburrieron. Clásico.",
    "Igual lo van a romper: mejor que sea barato.",
    "Ser papá o mamá es caro. Esto no.",
    "Juguetes casi nuevos. Tus niños no van a notar la diferencia.",
    "Crecen tan rápido que ni alcanzarías a pagar las cuotas.",
  ],
  deporte: [
    "La excusa perfecta para salir a pedalear.",
    "Equípate para la próxima aventura.",
    "Muévete sin gastar una fortuna.",
    "Esa bicicleta estática que alguien juró que iba a usar.",
    "Pesas casi sin uso. Como las de todos.",
    "Ponte en forma este año. O el próximo, sin presión.",
    "Para sudar en el gimnasio… o donde prefieras.",
    "Equipo usado por gente que se rindió antes que tú.",
  ],
  libros: [
    "Historias buscando un nuevo lector.",
    "Música y libros con alma.",
    "Para leer, escuchar y volver a empezar.",
    "Libros leídos una vez y con ganas de repetir.",
    "Más barato que esa suscripción que nunca cancelas.",
    "Vinilos con historia y rayitas con carácter.",
    "Novelas para leer en la cama. O a escondidas.",
    "Leer te hace interesante. Comprarlo barato, inteligente.",
  ],
  herramientas: [
    "Para los maestros chasquilla.",
    "Arréglalo tú mismo, ahorra tú mismo.",
    "La herramienta que te faltaba, a precio justo.",
    "Para arreglar lo que rompiste intentando arreglarlo.",
    "El tamaño no importa: lo que importa es saber usarlo.",
    "Herramientas que ya saben hacer la pega. Falta que tú también.",
    "Taladro en mano, cero excusas.",
    "Hazlo tú mismo. Si sale mal, al menos salió barato.",
  ],
  ropa: [
    "Renueva tu clóset sin culpa.",
    "Estilo único, como cada prenda.",
    "Moda con historia y buen precio.",
    "Ropa con pasado, pero sin pasado turbio.",
    "Usada por otro, lucida por ti.",
    "Esa chaqueta que alguien no supo valorar.",
    "Más barato que ir al mall y arrepentirte.",
    "Para que te miren… y te pregunten dónde la compraste.",
  ],
  mascotas: [
    "Para los peludos de la casa.",
    "Tu mascota también merece un gustito.",
    "Camas, juguetes y mimos a buen precio.",
    "Tu perro igual va a dormir en tu cama, pero bueno.",
    "Juguetes que tu gato va a ignorar por la caja.",
    "Collares, correas y otros accesorios… para tu mascota, mal pensado.",
    "Cama para tu perro. Que después se la robe el gato no es culpa nuestra.",
    "Ellos mandan en la casa. Tú solo pagas, poquito.",
  ],
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
