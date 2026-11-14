/** Secciones del admin que se pueden dar a un rol del equipo. */
export const ADMIN_SECTIONS = [
  { key: "productos", label: "Productos", href: "/admin", hint: "Subir, editar y borrar productos y sus fotos" },
  { key: "pedidos", label: "Pedidos", href: "/admin/pedidos", hint: "Ver los pedidos y su estado" },
  { key: "vendedores", label: "Vendedores", href: "/admin/vendedores", hint: "Aprobar vendedores, comisiones y pagos" },
  { key: "portada", label: "Portada", href: "/admin/portada", hint: "Banners de la página de inicio" },
  { key: "recomendador", label: "Recomendador", href: "/admin/recomendador", hint: "Ajustes de \"conocer al comprador\"" },
  { key: "mudanzas", label: "Agenda mudanzas", href: "/admin/mudanzas", hint: "Reservas, servicios y días bloqueados" },
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number]["key"];
/** "equipo" no se puede dar a un rol: es solo de los administradores totales. */
export type AdminArea = AdminSection | "equipo";

export const SECTION_KEYS = ADMIN_SECTIONS.map((s) => s.key) as AdminSection[];

export function sectionLabel(key: string) {
  return ADMIN_SECTIONS.find((s) => s.key === key)?.label ?? key;
}
