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
  /** Segunda parte del título en Google y al compartir el link: "MUVEO · …" */
  seoTitle: "Muebles y electro a precios bajísimos en Santiago",
  /** Palabras clave (pesan poco en Google, pero ayudan a otros buscadores) */
  keywords: ["muebles baratos", "muebles usados", "electrodomésticos baratos", "outlet muebles", "segunda mano Santiago", "decoración barata", "MUVEO"],
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
   * public/icons/, src/app/icon.svg, src/app/apple-icon.png y src/app/favicon.ico.
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
  /**
   * Datos de la empresa para las páginas de ayuda y legales (/contacto,
   * /privacidad, /terminos, /devoluciones, /envios). Lo que quede vacío no se muestra.
   */
  legal: {
    /** Razón social, ej. "Muveo SpA" */
    companyName: "",
    /** RUT de la empresa, ej. "77.123.456-7" */
    rut: "",
    /** Dirección de la bodega u oficina (para retiros y avisos legales) */
    address: "",
    city: "Santiago",
    email: "hola@muveo.cl",
    /** WhatsApp con código de país, ej. "+56912345678". Vacío = se usa el del admin. */
    whatsapp: "",
    /** Horario de atención */
    hours: "Lunes a sábado, 9:00 a 18:00",
    /** Días corridos para arrepentirse de una compra (derecho a retracto) */
    returnDays: 10,
    /** Fecha de la última actualización de las políticas */
    updatedAt: "16 de noviembre de 2026",
  },
};
