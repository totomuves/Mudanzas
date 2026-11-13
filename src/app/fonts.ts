/**
 * 🔤 TIPOGRAFÍA
 * Cambia "Nunito" por cualquier fuente de https://fonts.google.com
 * (por ejemplo Poppins, Inter, Montserrat, Quicksand). Para fuentes con
 * pesos fijos agrega: weight: ["400", "700", "900"].
 */
import { Nunito } from "next/font/google";

export const mainFont = Nunito({ variable: "--font-main", subsets: ["latin"] });
