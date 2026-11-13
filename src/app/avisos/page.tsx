import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { hasSupabaseEnv } from "@/lib/env";
import { categoryMap, getCategories } from "@/lib/data";
import { getUser } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
import { ProductImage } from "@/components/ProductImage";
import { Icon } from "@/components/Icon";
import type { Product } from "@/lib/types";
import { AvisosSettings } from "./AvisosSettings";

export const metadata: Metadata = { title: "Avisos" };

type Row = { id: number; title: string; body: string | null; url: string | null; read_at: string | null; created_at: string; products: Product | null };

const dateFmt = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function AvisosPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const { supabase, user } = await getUser();

  let rows: Row[] = [];
  let notifyOn = true;
  let ready = true;
  if (user) {
    const [{ data, error }, { data: profile }] = await Promise.all([
      supabase
        .from("notifications")
        .select("id, title, body, url, read_at, created_at, products(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    ]);
    ready = !error;
    rows = (data ?? []) as unknown as Row[];
    notifyOn = (profile as { notify_matches?: boolean } | null)?.notify_matches ?? true;
    if (rows.some((r) => !r.read_at)) {
      // Al verlos, quedan leídos (después de mostrar los "nuevos")
      after(async () => {
        await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
      });
    }
  }
  const cats = categoryMap(await getCategories());

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-black">Avisos</h1>
        <p className="text-muted">Te aviso cuando llega algo que creo que te va a gustar.</p>
      </div>

      {user && ready && (
        <AvisosSettings
          userId={user.id}
          initialOn={notifyOn}
          vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
        />
      )}

      {rows.length === 0 ? (
        <div className="rounded-card border-2 border-dashed border-border p-8 text-center">
          <Icon name="bell" className="mx-auto h-12 w-12 text-muted" strokeWidth={1.4} />
          <p className="mt-2 text-muted">
            Aún no hay avisos. Mientras más uses Descubrir, mejor sé qué avisarte.
          </p>
          <Link href="/descubrir" className="mt-4 inline-block rounded-full bg-brand px-5 py-2.5 font-extrabold text-white">
            Ir a descubrir
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
          {rows.map((r) => {
            const p = r.products;
            const gone = !p || p.status !== "available";
            return (
              <li key={r.id}>
                <Link href={r.url ?? "/descubrir"} className={`flex items-center gap-3 p-3 hover:bg-background ${gone ? "opacity-60" : ""}`}>
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface">
                    {p && <ProductImage product={p} category={cats[p.category_slug]} sizes="64px" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-bold">
                      {!r.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Nuevo" />}
                      {r.title}
                    </p>
                    <p className="line-clamp-2 text-sm text-muted">{gone ? "Ya no está disponible" : r.body}</p>
                    <p className="text-xs text-muted">{dateFmt.format(new Date(r.created_at))}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
