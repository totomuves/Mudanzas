/**
 * MARCA DE LA APP
 * Cambia aquí el nombre, textos y logo. Los colores, bordes y sombras se
 * cambian en src/styles/theme.css, y la tipografía en src/app/fonts.ts.
 */
export const brand = {
  /** Nombre (se puede sobrescribir con NEXT_PUBLIC_APP_NAME) */
  name: process.env.NEXT_PUBLIC_APP_NAME || "MUVEO",
  /** Frase corta para buscadores y la app instalada */
  description: "Muebles, electro y tesoros a precios bajísimos. Desliza, elige y compra.",
  /** Textos de la portada */
  hero: {
    /** Texto del banner por defecto. El título grande de la portada sale de src/lib/phrases.ts */
    title: "Tu próximo regalón te está esperando.",
    subtitle: "Muebles, electro y tesoros a precios bajísimos. Desliza lo que te gusta y la app aprende qué mostrarte.",
    cta: "Empezar a descubrir",
  },
  /**
   * Logo: reemplaza public/brand/logo.svg por el logo definitivo (mismo nombre) o
   * pon aquí la ruta de otro archivo dentro de public/. Si queda vacío se dibuja
   * un cuadrado con el color de la marca. Los íconos de la app instalada están en
   * public/icons/ y src/app/icon.png.
   */
  logoImage: "/brand/logo.svg",
  /** Lo que aparece en el resumen de la tarjeta del comprador (máx. 13 caracteres) */
  statementDescriptor: "MUVEO",
  /**
   * Colores para la app instalada (barra del celular y pantalla de carga).
   * Deben coincidir con --background de src/styles/theme.css.
   */
  themeColor: "#ffffff",
  backgroundColor: "#ffffff",
};
