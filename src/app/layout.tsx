import type { Metadata, Viewport } from "next";
import { brand } from "@/brand";
import { logoFont, mainFont } from "./fonts";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { Footer } from "@/components/Footer";
import { RegisterSW } from "@/components/RegisterSW";
import { Analytics } from "@/components/marketing/Analytics";
import { CookieBanner } from "@/components/marketing/CookieBanner";
import { JsonLd } from "@/components/marketing/JsonLd";
import { siteUrl } from "@/lib/env";
import { getCookieConsentRequired } from "@/lib/site-settings";
import { siteVerification, socialLinks } from "@/lib/marketing/config";
import "./globals.css";

// Todo depende de la sesión y del stock en vivo: siempre render por request.
export const dynamic = "force-dynamic";


export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: `${brand.name} · ${brand.seoTitle}`, template: `%s · ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
  keywords: brand.keywords,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_CL",
    siteName: brand.name,
    title: `${brand.name} · ${brand.seoTitle}`,
    description: brand.description,
    url: "/",
    images: [{ url: "/og", width: 1200, height: 630, alt: brand.name }],
  },
  twitter: { card: "summary_large_image", title: `${brand.name} · ${brand.seoTitle}`, description: brand.description, images: ["/og"] },
  verification: {
    google: siteVerification.google || undefined,
    other: siteVerification.meta ? { "facebook-domain-verification": siteVerification.meta } : undefined,
  },
  appleWebApp: { capable: true, title: brand.name, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: brand.themeColor,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cookieConsentRequired = await getCookieConsentRequired();
  return (
    <html lang="es-CL" className={`${mainFont.variable} ${logoFont.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Header />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-12 pt-4 md:pb-12">{children}</main>
        <Footer cookieConsentRequired={cookieConsentRequired} />
        <BottomNav />
        <RegisterSW />
        <Analytics consentRequired={cookieConsentRequired} />
        <CookieBanner required={cookieConsentRequired} />
        <JsonLd
          data={[
            {
              "@context": "https://schema.org",
              "@type": "Organization",
              name: brand.name,
              url: siteUrl(),
              logo: `${siteUrl()}/icons/icon-512.png`,
              ...(socialLinks.length ? { sameAs: socialLinks.map((s) => s.url) } : {}),
            },
            {
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: brand.name,
              url: siteUrl(),
              inLanguage: "es-CL",
              potentialAction: {
                "@type": "SearchAction",
                target: `${siteUrl()}/catalogo?q={search_term_string}`,
                "query-input": "required name=search_term_string",
              },
            },
          ]}
        />
      </body>
    </html>
  );
}
