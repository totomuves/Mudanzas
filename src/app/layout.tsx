import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import { APP_NAME } from "@/lib/env";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { RegisterSW } from "@/components/RegisterSW";
import "./globals.css";

// Todo depende de la sesión y del stock en vivo: siempre render por request.
export const dynamic = "force-dynamic";

const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description:
    "Muebles, electro y tesoros que quedan en las mudanzas, a precios bajísimos. Desliza, elige y compra.",
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#ff6b3d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-CL" className={`${nunito.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Header />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-4 md:pb-10">{children}</main>
        <BottomNav />
        <RegisterSW />
      </body>
    </html>
  );
}
