import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { hasSupabaseEnv } from "@/lib/env";
import { requireSection } from "@/lib/admin";
import { SetupNotice } from "@/components/SetupNotice";
import { Icon } from "@/components/Icon";
import { WorkForm } from "./WorkForm";
import { deleteWork, moveWork, toggleWork } from "./actions";

export const metadata: Metadata = { title: "Trabajos realizados" };

type Work = { id: string; image_url: string; title: string | null; caption: string | null; active: boolean };

export default async function TrabajosAdminPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { supabase } = await requireSection("mudanzas");
  const { data, error } = await supabase
    .from("moving_works")
    .select("id, image_url, title, caption, active")
    .order("sort_order")
    .order("created_at");
  const works = (data ?? []) as Work[];

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-black">Trabajos realizados</h1>
        <p className="text-muted">
          Fotos reales de mudanzas hechas: el camión cargado, muebles protegidos, el equipo trabajando. Se muestran en la página{" "}
          <Link href="/mudanzas/conocenos" className="font-bold underline underline-offset-4">Conócenos</Link>. La primera sale más grande.
          Mientras no haya fotos visibles, esa sección no aparece.
        </p>
      </div>

      {error && (
        <p className="rounded-2xl bg-brand-soft p-4 text-sm font-bold">
          Falta crear la tabla. En Supabase, abre SQL Editor y corre el archivo supabase/migrations/20261116130000_trabajos_mudanzas.sql.
        </p>
      )}

      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-6">
        <h2 className="text-lg font-black">Nueva foto</h2>
        <WorkForm />
      </section>

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
                    <input type="hidden" name="dir" value="up" />
                    <button disabled={i === 0} className="rounded-full px-3 py-1.5 hover:bg-surface disabled:opacity-30" aria-label="Subir"><Icon name="up" className="h-4 w-4" strokeWidth={2.2} /></button>
                  </form>
                  <form action={moveWork}>
                    <input type="hidden" name="id" value={w.id} />
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
    </div>
  );
}
