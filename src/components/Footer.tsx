"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { brand } from "@/brand";
import { socialLinks } from "@/lib/marketing/config";
import { CookiePreferencesButton } from "@/components/marketing/CookieBanner";

const COLUMNS = [
  {
    title: "Comprar",
    links: [
      { href: "/catalogo", label: "Catálogo" },
      { href: "/descubrir", label: "Descubrir" },
      { href: "/carrito", label: "Carrito" },
      { href: "/mis-pedidos", label: "Mis pedidos" },
    ],
  },
  {
    title: "Ayuda",
    links: [
      { href: "/envios", label: "Envíos y retiro" },
      { href: "/devoluciones", label: "Cambios y devoluciones" },
      { href: "/contacto", label: "Contacto" },
      { href: "/mudanzas/conocenos", label: "Conócenos" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terminos", label: "Términos y condiciones" },
      { href: "/privacidad", label: "Privacidad" },
    ],
  },
];

/** Pie de página con los links de ayuda, legales y redes (oculto en el admin y el panel vendedor). */
export function Footer({ cookieConsentRequired }: { cookieConsentRequired: boolean }) {
  const pathname = usePathname();
  if (pathname.startsWith("/admin") || pathname.startsWith("/vendedor")) return null;
  return (
    <footer className="border-t border-border bg-surface/60 pb-28 pt-10 md:pb-10">
      <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 sm:grid-cols-2 md:grid-cols-4">
        <div className="space-y-2">
          <p className="font-logo text-2xl font-bold text-brand">{brand.name}</p>
          <p className="text-sm text-muted">{brand.description}</p>
          {socialLinks.length > 0 && (
            <ul className="flex flex-wrap gap-2 pt-2">
              {socialLinks.map((s) => (
                <li key={s.name}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold hover:bg-surface">
                    {s.name}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title} className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted">{col.title}</p>
            <ul className="space-y-1.5">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm font-semibold hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
              {col.title === "Legal" && cookieConsentRequired && (
                <li>
                  <CookiePreferencesButton required={cookieConsentRequired} className="text-left text-sm font-semibold hover:underline" />
                </li>
              )}
            </ul>
          </nav>
        ))}
      </div>
      <p className="mx-auto mt-8 w-full max-w-5xl px-4 text-xs text-muted">
        © {new Date().getFullYear()} {brand.legal.companyName || brand.name} · Pagos seguros con Mercado Pago
      </p>
    </footer>
  );
}
