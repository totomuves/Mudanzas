import type { IconName } from "@/components/Icon";

/**
 * POSIBLES MUDANZAS
 * Quien parece que se cambia de casa recibe la pregunta "¿Te cambias de casa?".
 * Si dice que sí, se le explica una idea por visita (estos 4 pasos).
 * Aquí SÍ se habla de mudanzas: solo lo ve quien dijo que se cambia.
 */
export type MovingStep = { title: string; text: string; cta: string; href: string; icon: IconName };

export const MOVING_STEPS: MovingStep[] = [
  {
    title: "Cotiza tu mudanza en 1 minuto",
    text: "Eliges el día, pones las dos direcciones y ves el precio al tiro. Sin compromiso.",
    cta: "Cotizar mi mudanza",
    href: "/mudanzas/cotizar",
    icon: "calculator",
  },
  {
    title: "Lo que no te lleves, lo retiramos gratis",
    text: "Mándanos fotos de lo que ya no vas a usar y pasamos a buscarlo sin costo, sujeto a evaluación.",
    cta: "Pedir un retiro",
    href: "/retiramos",
    icon: "boxOpen",
  },
  {
    title: "Lo que nos entregas vale créditos",
    text: "Por lo que retiramos te damos créditos para comprar en MUVEO lo que te falte en la casa nueva. El despacho se paga aparte.",
    cta: "Ver la tienda",
    href: "/catalogo",
    icon: "gift",
  },
  {
    title: "Tu mudanza te espera",
    text: "Tu cotización sigue lista. Reserva tu día antes de que se llene la agenda.",
    cta: "Reservar mi mudanza",
    href: "/mudanzas/cotizar",
    icon: "calendar",
  },
];

export const MOVE_WHEN = [
  { key: "este_mes", label: "Este mes" },
  { key: "proximo_mes", label: "El próximo mes" },
  { key: "mas_adelante", label: "Más adelante" },
  { key: "no_se", label: "Aún no sé" },
] as const;

export type MoveWhen = (typeof MOVE_WHEN)[number]["key"];

export const TEAM_STATUS = [
  { key: "nuevo", label: "Nuevo" },
  { key: "contactado", label: "Contactado" },
  { key: "cotizo", label: "Cotizó" },
  { key: "reservo", label: "Reservó" },
  { key: "descartado", label: "Descartado" },
] as const;

export type PromptState =
  | { show: null }
  | { show: "pregunta" }
  | { show: "paso"; step: number; offer: string };

/** Páginas que suman puntos al visitarlas (una vez por día). */
export function signalForPath(pathname: string): "pagina_mudanzas" | "conocenos" | "cotizador" | "retiramos" | null {
  if (pathname === "/mudanzas") return "pagina_mudanzas";
  if (pathname.startsWith("/mudanzas/conocenos")) return "conocenos";
  if (pathname.startsWith("/mudanzas/cotizar")) return "cotizador";
  if (pathname.startsWith("/retiramos")) return "retiramos";
  return null;
}

/** Donde no se interrumpe: admin, vendedores, reparto, pago y las propias páginas de mudanzas. */
export function quietPath(pathname: string) {
  return /^\/(admin|vendedor|reparto|carrito|comprar|compra|pedido|ingresar|recuperar|auth|bienvenida|mudanzas|retiramos)(\/|$)/.test(pathname);
}
