/**
 * TIPOGRAFÍA
 * Cambia "Figtree" por cualquier fuente de https://fonts.google.com
 * (por ejemplo Plus_Jakarta_Sans, Archivo, Inter, Nunito). Para fuentes con
 * pesos fijos agrega: weight: ["400", "700", "900"].
 */
import { Figtree, Montserrat_Alternates } from "next/font/google";

export const mainFont = Figtree({ variable: "--font-main", subsets: ["latin"] });

/**
 * Tipografía del nombre en el logo (encabezado y pantalla de carga).
 * Se usa con la clase "font-logo".
 */
export const logoFont = Montserrat_Alternates({ variable: "--font-logo-face", subsets: ["latin"], weight: ["700"] });
