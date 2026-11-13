/**
 * MARCA DE LA APP
 * Cambia aquí el nombre, textos y logo. Los colores, bordes y sombras se
 * cambian en src/styles/theme.css, y la tipografía en src/app/fonts.ts.
 */
export const brand = {
  /** Nombre (se puede sobrescribir con NEXT_PUBLIC_APP_NAME) */
  name: process.env.NEXT_PUBLIC_APP_NAME || "Totomuves",
  /** Frase corta para buscadores y la app instalada */
  description: "Muebles, electro y tesoros que quedan en las mudanzas, a precios bajísimos. Desliza, elige y compra.",
  /** Textos de la portada */
  hero: {
    title: "Lo que otros dejan en su mudanza, tú lo estrenas.",
    subtitle: "Muebles, electro y tesoros a precios bajísimos. Desliza lo que te gusta y la app aprende qué mostrarte.",
    cta: "Empezar a descubrir",
  },
  /**
   * Logo: pon tu archivo en public/brand/ (ej. public/brand/logo.svg) y
   * escribe aquí su ruta: "/brand/logo.svg". Si queda vacío se dibuja una caja con el color de la marca.
   */
  logoImage: "",
  /** Lo que aparece en el resumen de la tarjeta del comprador (máx. 13 caracteres) */
  statementDescriptor: "TOTOMUVES",
  /**
   * Colores para la app instalada (barra del celular y pantalla de carga).
   * Deben coincidir con --background de src/styles/theme.css.
   */
  themeColor: "#ffffff",
  backgroundColor: "#ffffff",
};
