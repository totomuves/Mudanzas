/**
 * CONTENIDO DE LA PÁGINA "CONÓCENOS" (/mudanzas/conocenos)
 * Textos tomados de totomoves.cl y adaptados a MUVEO. Cámbialos aquí:
 * se actualizan en la página al publicar.
 * Las fotos de "Trabajos realizados" NO van aquí: se suben en /admin/mudanzas/trabajos.
 */
import type { IconName } from "@/components/Icon";

/** Ficha de Google con las reseñas */
export const GOOGLE_REVIEWS_URL = "https://www.google.com/search?q=totomoves#mpd=~11284503209019987792/customers/reviews";
export const GOOGLE_RATING = "5,0";

/** El vehículo */
export const VEHICLE = {
  name: "Sprinter cerrada",
  photo: "/mudanzas/sprinter.webp",
  intro: "Un furgón cerrado de 10 m³: tus cosas viajan protegidas del sol, la lluvia y el polvo, de puerta a puerta.",
  specs: [
    { icon: "box", label: "Capacidad", value: "10 m³" },
    { icon: "shield", label: "Carga", value: "Furgón cerrado" },
    { icon: "users", label: "Equipo", value: "Conductor + ayudante si lo necesitas" },
    { icon: "mountain", label: "Alcance", value: "Santiago, montaña y regiones" },
  ] as { icon: IconName; label: string; value: string }[],
  /** Guía de tamaño (la misma del cotizador de totomoves.cl) */
  sizes: [
    { label: "Pocas cosas o una pieza", value: "hasta 2 m³" },
    { label: "1 dormitorio", value: "hasta 5 m³" },
    { label: "2 dormitorios", value: "Sprinter llena aprox." },
    { label: "Casa de 3 o más dormitorios", value: "posible 2 viajes" },
  ],
};

/** Lo que hacemos */
export const SERVICES: { icon: IconName; title: string; text: string }[] = [
  { icon: "building", title: "Mudanza de departamento", text: "Con inventario claro: sabes qué se carga y cómo llega." },
  { icon: "truck", title: "Flete pequeño", text: "Cajas, muebles sueltos o esa compra que no cabe en el auto." },
  { icon: "home", title: "Entretecho y objetos usados", text: "Sacamos lo que se acumuló y lo llevamos a donde lo necesites." },
  { icon: "mountain", title: "Montaña y regiones", text: "Viajes programados fuera de Santiago, con ruta definida." },
  { icon: "store", title: "Abastecimiento", text: "Para locales y eventos que necesitan llegar a tiempo." },
  { icon: "piano", title: "Carga delicada", text: "Arte, espejos, pantallas o instrumentos, con embalaje coordinado." },
];

/** Compromisos (de las condiciones del servicio de totomoves.cl) */
export const PROMISES: { icon: IconName; title: string; text: string }[] = [
  { icon: "calculator", title: "Precio conversado antes", text: "Te damos un valor de referencia y lo confirmamos contigo antes del servicio. Sin sorpresas al final." },
  { icon: "routeMap", title: "Ruta definida antes de salir", text: "Origen, destino, horario y accesos quedan claros antes de partir." },
  { icon: "chat", title: "Atención directa", text: "Hablas con quien hace el trabajo, por WhatsApp, de principio a fin." },
  { icon: "box", title: "Carga cuidada", text: "Lo frágil, electrónico o de alto valor se embala según lo que coordinemos contigo." },
];

/** Reseñas reales de Google, textuales (copiadas de totomoves.cl). No las edites: si cambias el texto deja de ser la reseña real. */
export const REVIEWS: { name: string; text: string }[] = [
  { name: "Claudia Plaza", text: "Fletes Toto, lejos lo mejor, eficiente, muy rápido y cuidadoso, 100% confiable y precios muy conscientes. Gracias" },
  { name: "Piri del real", text: "Excelente servicio, muy profesional y puntual. Mi carga llegó intacta, además de compartir una grata conversación. Más que recomendado" },
  { name: "José Purto", text: "Los mejores fletes de Santiago! Buenísima la disposición de Toto, cabe de todo en la van, y llega todo perfecto!" },
  { name: "Mayra Feddersen", text: "Muy buena la atención de Cristóbal. Respondió de forma pronta, llegó en el horario acordado y el servicio me pareció muy profesional." },
  { name: "Alexandra Castillo", text: "Excelente servicio! Puntual, cuidadoso y amable" },
  { name: "Patricio Latorre", text: "Este sábado contraté con Totomoves y tuve un excelente servicio. Puntual, rápido y con buena disposición" },
  { name: "Andrés Maturana", text: "Hicimos una mudanza muy rápida y sin ningún error, muy buen servicio y recomendable." },
  { name: "Nicolás Aramburú", text: "Muy bueno, me ayudó un montón, servicial y simpático" },
  { name: "Estudios Cordillera", text: "Son los mejores, realmente me hicieron sentir muy cómodo." },
  { name: "Bárbara Rojas", text: "Excelente servicio, muy amable y profesional!! Recomiendo 100%." },
  { name: "Joyce Poulet Fernández", text: "Super bueno!!! Recomendado 100%!" },
];

/** Quién está detrás */
export const FOUNDER = {
  name: "Cristóbal Middleton",
  role: "Fundador y operador",
  text: "Cada servicio lo opera directamente Cristóbal. La prioridad es simple: ruta clara, carga cuidada, horarios definidos y comunicación directa por WhatsApp.",
};
