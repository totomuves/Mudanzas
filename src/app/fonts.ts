/**
 * TIPOGRAFÍA
 * Cambia "Figtree" por cualquier fuente de https://fonts.google.com
 * (por ejemplo Plus_Jakarta_Sans, Archivo, Inter, Nunito). Para fuentes con
 * pesos fijos agrega: weight: ["400", "700", "900"].
 */
import { Figtree } from "next/font/google";

export const mainFont = Figtree({ variable: "--font-main", subsets: ["latin"] });
