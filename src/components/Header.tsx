import Link from "next/link";
import { Logo } from "./Logo";

const links = [
  { href: "/mudanzas", label: "Mudanzas" },
  { href: "/descubrir", label: "Descubrir" },
  { href: "/catalogo", label: "Catálogo" },
  { href: "/favoritos", label: "Favoritos" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-bold md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-muted hover:text-foreground">
              {l.label}
            </Link>
          ))}
          <Link
            href="/bienvenida"
            className="rounded-full bg-brand px-4 py-2 text-white hover:bg-brand-dark"
          >
            Mis gustos
          </Link>
        </nav>
      </div>
    </header>
  );
}
