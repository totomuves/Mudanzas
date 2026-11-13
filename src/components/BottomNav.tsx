"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

const items: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/descubrir", label: "Descubrir", icon: "cards" },
  { href: "/mudanzas", label: "Mudanzas", icon: "truck" },
  { href: "/favoritos", label: "Favoritos", icon: "heart" },
  { href: "/bienvenida", label: "Gustos", icon: "sparkle" },
];

export function BottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md justify-around">
        {items.map((it) => {
          const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 px-3 pb-1.5 pt-2 text-[11px] font-semibold ${
                  active ? "text-foreground" : "text-muted"
                }`}
              >
                <Icon name={it.icon} className="h-6 w-6" strokeWidth={active ? 2.2 : 1.7} />
                {it.label}
                <span className={`mt-0.5 h-0.5 w-5 rounded-full ${active ? "bg-foreground" : "bg-transparent"}`} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
