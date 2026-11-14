import type { Metadata } from "next";
import Link from "next/link";
import { hasSupabaseEnv } from "@/lib/env";
import { categoryMap, getCategories } from "@/lib/data";
import { after } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { logSearch } from "@/lib/recsys/server";
import { ProductCard } from "@/components/ProductCard";
import { SetupNotice } from "@/components/SetupNotice";
import type { Product } from "@/lib/types";
import { getPhrase } from "@/lib/phrases";

export const metadata: Metadata = { title: "Catálogo" };

export default async function CatalogoPage({ searchParams }: PageProps<"/catalogo">) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const sp = await searchParams;
  const categoria = typeof sp.categoria === "string" ? sp.categoria : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";

  const { supabase, user } = await getUser();
  // Lo que busca el comprador alimenta sus gustos (sin demorar la página)
  if (q && user) after(() => logSearch(user.id, q));
  let query = supabase
    .from("products")
    .select("*")
    .eq("status", "available")
    .order("created_at", { ascending: false })
    .limit(60);
  if (categoria) query = query.eq("category_slug", categoria);
  if (q) query = query.ilike("title", `%${q.replace(/[%_,()]/g, " ")}%`);

  const [categories, { data }, headline] = await Promise.all([
    getCategories(),
    query,
    categoria ? getPhrase(categoria) : Promise.resolve(null),
  ]);
  const cats = categoryMap(categories);
  const products = (data ?? []) as Product[];

  return (
    <div className="space-y-5">
      {categoria && headline ? (
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">{cats[categoria]?.name ?? "Catálogo"}</p>
          <h1 className="text-3xl font-black leading-tight">{headline}</h1>
        </div>
      ) : (
        <h1 className="text-3xl font-black">Catálogo</h1>
      )}
      <form className="flex gap-2">
        {categoria && <input type="hidden" name="categoria" value={categoria} />}
        <input
          name="q"
          defaultValue={q}
          placeholder="Busca: sofá, microondas, bicicleta…"
          className="min-w-0 flex-1 rounded-full bg-surface px-4 py-3 outline-none focus:ring-2 focus:ring-foreground"
        />
        <button className="rounded-full bg-foreground px-5 font-extrabold text-background">Buscar</button>
      </form>
      <div className="scroll-row -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip href={q ? `/catalogo?q=${encodeURIComponent(q)}` : "/catalogo"} active={!categoria}>
          Todo
        </Chip>
        {categories.map((c) => (
          <Chip
            key={c.slug}
            href={`/catalogo?categoria=${c.slug}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            active={categoria === c.slug}
          >
            {c.name}
          </Chip>
        ))}
      </div>
      {products.length === 0 ? (
        <p className="py-10 text-center text-muted">No encontramos productos con ese filtro.</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4 md:gap-x-5">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} category={cats[p.category_slug]} />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold ${
        active ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
