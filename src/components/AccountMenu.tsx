"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";

type Props = {
  account: { email: string; isAdmin: boolean; sellerStatus: string | null; marketplace: boolean } | null;
};

/** Botón "Ingresar" o, con sesión iniciada, el menú de la cuenta. */
export function AccountMenu({ account }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cierra el menú al cambiar de página, al tocar fuera o con Escape
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!account) {
    const next = pathname && pathname !== "/ingresar" ? pathname : "/";
    return (
      <Link
        href={`/ingresar?next=${encodeURIComponent(next)}`}
        className="flex h-9 items-center gap-1.5 rounded-full border border-foreground px-3 text-sm font-bold hover:bg-surface md:h-10 md:px-4"
      >
        <Icon name="user" className="h-4 w-4" strokeWidth={2.2} />
        Ingresar
      </Link>
    );
  }

  const links: { href: string; label: string; icon: IconName }[] = [
    { href: "/mis-pedidos", label: "Mis pedidos", icon: "bag" },
    { href: "/mis-gustos", label: "Mis gustos", icon: "sparkle" },
    { href: "/favoritos", label: "Favoritos", icon: "heart" },
  ];
  if (account.marketplace && account.sellerStatus) links.push({ href: "/vendedor", label: "Panel vendedor", icon: "store" });
  if (account.isAdmin) links.push({ href: "/admin", label: "Admin", icon: "tools" });
  if (account.marketplace && !account.sellerStatus) links.push({ href: "/vender", label: "Vender en MÜVEO", icon: "store" });
  links.push({ href: "/cuenta/clave", label: "Crear o cambiar contraseña", icon: "lock" });

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Mi cuenta"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-sm font-black uppercase text-background"
      >
        {account.email[0]}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-40 w-64 overflow-hidden rounded-card border border-border bg-card py-2 shadow-xl"
        >
          <p className="truncate px-4 pb-2 pt-1 text-xs text-muted">{account.email}</p>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              role="menuitem"
              className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold hover:bg-surface"
            >
              <Icon name={l.icon} className="h-5 w-5" />
              {l.label}
            </Link>
          ))}
          <form action="/auth/salir" method="post" className="mt-1 border-t border-border pt-1">
            <button role="menuitem" className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold hover:bg-surface">
              <Icon name="logout" className="h-5 w-5" />
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
