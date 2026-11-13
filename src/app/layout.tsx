import type { Metadata, Viewport } from "next";
import { brand } from "@/brand";
import { mainFont } from "./fonts";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { RegisterSW } from "@/components/RegisterSW";
import "./globals.css";

// Todo depende de la sesión y del stock en vivo: siempre render por request.
export const dynamic = "force-dynamic";


export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
  appleWebApp: { capable: true, title: brand.name, statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: brand.themeColor,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-CL" className={`${mainFont.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Header />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-4 md:pb-10">{children}</main>
        <BottomNav />
        <RegisterSW />
      </body>
    </html>
  );
}
