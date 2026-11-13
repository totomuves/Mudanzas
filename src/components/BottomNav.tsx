"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Inicio", icon: "🏠" },
  { href: "/descubrir", label: "Descubrir", icon: "🔥" },
  { href: "/mudanzas", label: "Mudanzas", icon: "🚚" },
  { href: "/favoritos", label: "Favoritos", icon: "❤️" },
  { href: "/bienvenida", label: "Gustos", icon: "✨" },
];

export function BottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md justify-around">
        {items.map((it) => {
          const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={`flex flex-col items-center px-3 py-2 text-[11px] font-bold ${
                  active ? "text-brand" : "text-muted"
                }`}
              >
                <span className={`text-xl ${active ? "" : "grayscale"}`} aria-hidden>
                  {it.icon}
                </span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
