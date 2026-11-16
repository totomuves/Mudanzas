import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { hasSupabaseEnv } from "@/lib/env";
import { getAdminAccess, requireSection } from "@/lib/admin";
import { SetupNotice } from "@/components/SetupNotice";
import { Icon } from "@/components/Icon";
import type { HomeBanner } from "@/lib/types";
import { BannerForm } from "../portada/BannerForm";
import { BannerItem } from "../portada/BannerItem";
import { WorkForm } from "./WorkForm";
import { deleteWork, moveWork, toggleWork } from "./work-actions";

export const metadata: Metadata = { title: "Banners y fotos de páginas" };

const PAGES = {
  mudanzas: { label: "Mudanzas", href: "/mudanzas", photosTitle: "Fotos de la página" },
  conocenos: { label: "Conócenos", href: "/mudanzas/conocenos", photosTitle: "Trabajos realizados" },
} as const;
type EditablePage = keyof typeof PAGES;

type Work = { id: string; image_url: string; title: string | null; caption: string | null; active: boolean };

export default async function PaginasAdminPage({ searchParams }: PageProps<"/admin/paginas">) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  // Entra quien tiene Portada o Agenda mudanzas
  const access = await getAdminAccess();
  const { supabase, sections } =
    access.sections.includes("portada") || access.sections.includes("mudanzas") ? access : await requireSection("mudanzas");
  const canPhotos = sections.includes("mudanzas");

  const sp = await searchParams;
  const page: EditablePage = sp.pagina === "mudanzas" ? "mudanzas" : "conocenos";
  const info = PAGES[page];

  const bannersRes = await supabase.from("home_banners").select("*").eq("page", page).order("sort_order").order("created_at");
  const banners = (bannersRes.data ?? []) as HomeBanner[];
  const missingMigration = Boolean(bannersRes.error);

  let works: Work[] = [];
  let worksError = false;
  if (canPhotos) {
    const query = () => supabase.from("moving_works").select("id, image_url, title, caption, active").order("sort_order").order("created_at");
    let res = await query().eq("page", page);
    // Sin la migración de páginas, todas las fotos son de Conócenos
    if (res.error && page === "conocenos") res = await query();
    works = (res.data ?? []) as Work[];
    worksError = Boolean(res.error);
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-2xl font-black">Banners y fotos de páginas</h1>
        <p className="text-muted">
          Agrega banners y fotos a las páginas de mudanzas. Los banners pueden ser de foto completa, media foto, degradado o color plano.
          El resto de la página (precios, cotizador, reseñas) no cambia.
        </p>
        <nav className="flex flex-wrap gap-2" aria-label="Página">
          {(Object.keys(PAGES) as EditablePage[]).map((p) => (
            <Link
              key={p}
              href={`/admin/paginas?pagina=${p}`}
              aria-current={p === page ? "page" : undefined}
              className={`rounded-full border px-4 py-2 text-sm font-bold ${
                p === page ? "border-foreground bg-foreground text-background" : "border-border hover:bg-surface"
              }`}
            >
              {PAGES[p].label}
            </Link>
          ))}
          {sections.includes("portada") && (
            <Link href="/admin/portada" className="rounded-full border border-border px-4 py-2 text-sm font-bold hover:bg-surface">
              Portada (inicio)
            </Link>
          )}
          <Link href={info.href} target="_blank" className="ml-auto flex items-center gap-1 px-2 py-2 text-sm font-bold underline underline-offset-4">
            Ver página <Icon name="external" className="h-4 w-4" strokeWidth={2} />
          </Link>
        </nav>
      </div>

      {missingMigration && (
        <p className="rounded-2xl bg-brand-soft p-4 text-sm font-bold">
          Falta un paso en Supabase: abre SQL Editor y corre el archivo 20261116140000_banners_paginas.sql. Después de eso ya puedes crear banners aquí.
        </p>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-black">Banners en {info.label}</h2>
          <p className="text-sm text-muted">
            Cada banner va arriba (bajo la portada de la página) o abajo (antes del final). Si hay más de uno en el mismo lugar, se deslizan de lado.
          </p>
        </div>
        {banners.length > 0 ? (
          <ul className="space-y-4">
            {banners.map((b, i) => (
              <BannerItem key={b.id} banner={b} page={page} first={i === 0} last={i === banners.length - 1} />
            ))}
          </ul>
        ) : (
          !missingMigration && (
            <p className="rounded-2xl border-2 border-dashed border-border p-6 text-center text-muted">
              Esta página aún no tiene banners.
            </p>
          )
        )}
        {!missingMigration && (
          <div className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-6">
            <h3 className="text-lg font-black">Nuevo banner</h3>
            <BannerForm key={`${page}-${banners.length}`} page={page} />
          </div>
        )}
      </section>

      {canPhotos && (
        <section id="fotos" className="scroll-mt-24 space-y-4">
          <div>
            <h2 className="text-xl font-black">{info.photosTitle}</h2>
            <p className="text-sm text-muted">
              Fotos reales: el camión cargado, muebles protegidos, el equipo trabajando. Salen como galería en la página {info.label}; la
              primera sale más grande. Mientras no haya fotos visibles, la galería no aparece.
            </p>
          </div>

          {worksError ? (
            <p className="rounded-2xl bg-brand-soft p-4 text-sm font-bold">
              {page === "mudanzas"
                ? "Para poner fotos en la página Mudanzas falta correr en Supabase el archivo 20261116140000_banners_paginas.sql."
                : "Falta crear la tabla. En Supabase, abre SQL Editor y corre el archivo 20261116130000_trabajos_mudanzas.sql."}
            </p>
          ) : (
            <div className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-6">
              <h3 className="text-lg font-black">Nueva foto</h3>
              <WorkForm key={page} page={page} />
            </div>
          )}

          {works.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {works.map((w, i) => (
                <li key={w.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                  <div className="relative aspect-[4/3] bg-surface">
                    <Image src={w.image_url} alt={w.title ?? ""} fill sizes="(max-width: 768px) 100vw, 33vw" className={`object-cover ${w.active ? "" : "opacity-40"}`} />
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="font-extrabold">{w.title || <span className="text-muted">Sin título</span>}</p>
                    {w.caption && <p className="text-sm text-muted">{w.caption}</p>}
                    <div className="flex flex-wrap items-center gap-1 text-sm font-bold">
                      <form action={toggleWork}>
                        <input type="hidden" name="id" value={w.id} />
                        <input type="hidden" name="active" value={w.active ? "0" : "1"} />
                        <button className={`rounded-full px-3 py-1.5 ${w.active ? "bg-accent/12 text-accent" : "bg-surface text-muted"}`}>
                          {w.active ? "Visible" : "Oculta"}
                        </button>
                      </form>
                      <form action={moveWork} className="ml-auto">
                        <input type="hidden" name="id" value={w.id} />
                        <input type="hidden" name="page" value={page} />
                        <input type="hidden" name="dir" value="up" />
                        <button disabled={i === 0} className="rounded-full px-3 py-1.5 hover:bg-surface disabled:opacity-30" aria-label="Subir"><Icon name="up" className="h-4 w-4" strokeWidth={2.2} /></button>
                      </form>
                      <form action={moveWork}>
                        <input type="hidden" name="id" value={w.id} />
                        <input type="hidden" name="page" value={page} />
                        <input type="hidden" name="dir" value="down" />
                        <button disabled={i === works.length - 1} className="rounded-full px-3 py-1.5 hover:bg-surface disabled:opacity-30" aria-label="Bajar"><Icon name="down" className="h-4 w-4" strokeWidth={2.2} /></button>
                      </form>
                      <form action={deleteWork}>
                        <input type="hidden" name="id" value={w.id} />
                        <button className="rounded-full px-3 py-1.5 text-pass hover:bg-surface" aria-label="Borrar"><Icon name="trash" className="h-4 w-4" strokeWidth={2.2} /></button>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
