import Link from "next/link";
import { Logo } from "./Logo";
import { Icon } from "./Icon";
import { AccountMenu } from "./AccountMenu";
import { getAccount } from "@/lib/account";

const links = [
  { href: "/descubrir", label: "Descubrir" },
  { href: "/catalogo", label: "Catálogo" },
  { href: "/mudanzas", label: "Mudanzas" },
  { href: "/favoritos", label: "Favoritos" },
];

export async function Header() {
  const account = await getAccount();
  return (
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 text-xl font-black tracking-tight">
          <Logo />
        </Link>
        <form action="/catalogo" className="ml-auto hidden flex-1 md:block md:max-w-sm">
          <label className="flex items-center gap-2 rounded-full bg-surface px-4 py-2.5 text-sm text-muted focus-within:ring-2 focus-within:ring-foreground">
            <Icon name="search" className="h-4 w-4" strokeWidth={2} />
            <input name="q" placeholder="Buscar sofás, camas, lavadoras…" className="w-full bg-transparent text-foreground outline-none placeholder:text-muted" />
          </label>
        </form>
        <nav className="ml-auto hidden items-center gap-5 text-sm font-semibold md:ml-0 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-foreground/80 hover:text-foreground hover:underline underline-offset-4">
              {l.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/favoritos"
          aria-label="Favoritos"
          className="ml-auto flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface md:hidden"
        >
          <Icon name="heart" className="h-6 w-6" />
        </Link>
        <AccountMenu account={account} />
      </div>
    </header>
  );
}
