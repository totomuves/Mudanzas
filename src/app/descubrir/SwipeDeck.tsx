"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CONDITION_LABEL, isFlashActive } from "@/lib/format";
import type { Category, Product, SwipeAction, UserCategory } from "@/lib/types";
import { ProductImage } from "@/components/ProductImage";
import { PriceTag } from "@/components/PriceTag";
import { FlashCountdown } from "@/components/FlashCountdown";
import { Icon, CategoryIcon } from "@/components/Icon";
import { TasteMeter } from "./TasteMeter";

// Mismos valores que el trigger learn_from_swipe en la base de datos
const DELTA: Record<SwipeAction, number> = { superlike: 2, like: 1, pass: -0.4 };
const SWIPE_X = 110;
const SWIPE_Y = 130;

const LIKE_MESSAGES = [
  "¡Buen ojo!",
  "Guardado en favoritos",
  "Ese tiene tu nombre",
  "¡Anotado! Te mostraré más así",
  "Uff, joyita",
];

type Exit = { id: string; action: SwipeAction } | null;

export function SwipeDeck({
  userId,
  categories,
  initialPrefs,
  initialSwipeCount,
}: {
  userId: string;
  categories: Category[];
  initialPrefs: UserCategory[];
  initialSwipeCount: number;
}) {
  const supabase = createClient();
  const cats = useMemo(() => Object.fromEntries(categories.map((c) => [c.slug, c])), [categories]);

  const [deck, setDeck] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);
  const [exit, setExit] = useState<Exit>(null);
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(initialPrefs.map((p) => [p.category_slug, p.weight + (p.selected ? 3 : 0)])),
  );
  const [swipeCount, setSwipeCount] = useState(initialSwipeCount);
  const [last, setLast] = useState<{ product: Product; action: SwipeAction } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [superliked, setSuperliked] = useState<Product | null>(null);
  const [loadError, setLoadError] = useState(false);

  const seen = useRef(new Set<string>());
  const fetching = useRef(false);
  // Filtro de categorías (chips). Vacío = todas.
  const [filters, setFilters] = useState<string[]>([]);
  const filtersRef = useRef<string[]>([]);
  const [selectedCats, setSelectedCats] = useState<Set<string>>(
    () => new Set(initialPrefs.filter((p) => p.selected).map((p) => p.category_slug)),
  );

  const fetchMore = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    const wanted = filtersRef.current;
    const { data, error } = await supabase.rpc("get_feed", {
      p_limit: 15,
      p_categories: wanted.length ? wanted : null,
    });
    fetching.current = false;
    // Si cambiaron los filtros mientras cargaba, esta respuesta ya no sirve
    if (wanted !== filtersRef.current) return;
    setLoading(false);
    if (error) {
      console.error("[get_feed]", error);
      setLoadError(true);
      return;
    }
    setLoadError(false);
    const fresh = ((data ?? []) as Product[]).filter((p) => !seen.current.has(p.id));
    fresh.forEach((p) => seen.current.add(p.id));
    if (fresh.length === 0) setExhausted(true);
    setDeck((d) => [...d, ...fresh]);
  }, [supabase]);

  useEffect(() => {
    // Carga inicial del mazo
    fetchMore();
  }, [fetchMore]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const top = deck[0];

  const commit = useCallback(
    async (product: Product, action: SwipeAction) => {
      setDeck((d) => d.filter((p) => p.id !== product.id));
      setExit(null);
      setLast({ product, action });
      setSwipeCount((n) => n + 1);
      setWeights((w) => ({
        ...w,
        [product.category_slug]: (w[product.category_slug] ?? 0) + DELTA[action],
      }));
      if (action === "like") setToast(LIKE_MESSAGES[Math.floor(Math.random() * LIKE_MESSAGES.length)]);
      if (action === "superlike") setSuperliked(product);

      await supabase
        .from("swipes")
        .upsert({ user_id: userId, product_id: product.id, action }, { onConflict: "user_id,product_id" });

      if (deck.length - 1 <= 3 && !exhausted) fetchMore();
    },
    [supabase, userId, deck.length, exhausted, fetchMore],
  );

  const swipe = useCallback(
    (action: SwipeAction) => {
      if (!top || exit) return;
      setExit({ id: top.id, action });
      setTimeout(() => commit(top, action), 260);
    },
    [top, exit, commit],
  );

  async function undo() {
    if (!last) return;
    const { product, action } = last;
    setLast(null);
    setDeck((d) => [product, ...d]);
    setSwipeCount((n) => Math.max(0, n - 1));
    setWeights((w) => ({ ...w, [product.category_slug]: (w[product.category_slug] ?? 0) - DELTA[action] }));
    await supabase.from("swipes").delete().eq("user_id", userId).eq("product_id", product.id);
  }

  function applyFilters(next: string[]) {
    filtersRef.current = next;
    setFilters(next);
    setDeck([]);
    setExhausted(false);
    setLoadError(false);
    setLoading(true);
    seen.current = new Set();
    fetching.current = false;
    fetchMore();
  }

  /** Activa/desactiva una categoría. Elegirla también le enseña a la app que la necesitas. */
  async function toggleFilter(slug: string) {
    const next = filters.includes(slug) ? filters.filter((s) => s !== slug) : [...filters, slug];
    applyFilters(next);

    if (!filters.includes(slug) && !selectedCats.has(slug)) {
      setSelectedCats((s) => new Set(s).add(slug));
      setWeights((w) => ({ ...w, [slug]: (w[slug] ?? 0) + 3 }));
      await supabase
        .from("user_categories")
        .upsert({ user_id: userId, category_slug: slug, selected: true }, { onConflict: "user_id,category_slug" });
    }
  }

  async function reviewPassed() {
    setLoading(true);
    setExhausted(false);
    await supabase.from("swipes").delete().eq("user_id", userId).eq("action", "pass");
    seen.current = new Set(deck.map((p) => p.id));
    fetchMore();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") swipe("pass");
      if (e.key === "ArrowRight") swipe("like");
      if (e.key === "ArrowUp") swipe("superlike");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [swipe]);

  return (
    <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[1fr_280px]">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:col-span-2" role="group" aria-label="Filtrar por categorías">
        <button
          type="button"
          aria-pressed={filters.length === 0}
          onClick={() => filters.length > 0 && applyFilters([])}
          className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold ${
            filters.length === 0 ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-foreground"
          }`}
        >
          Todo
        </button>
        {categories.map((c) => {
          const on = filters.includes(c.slug);
          return (
            <button
              key={c.slug}
              type="button"
              aria-pressed={on}
              onClick={() => toggleFilter(c.slug)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-bold ${
                on ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-foreground"
              }`}
            >
              <CategoryIcon slug={c.slug} className="h-4 w-4" strokeWidth={2} /> {c.name}
            </button>
          );
        })}
      </div>
      <div className="mx-auto w-full max-w-sm">
        <div className="relative aspect-[3/4.2] max-h-[calc(100svh-17rem)] min-h-80 w-full">
          {loading && deck.length === 0 && (
            <div className="absolute inset-0 animate-pulse rounded-card bg-border" />
          )}
          {!loading && deck.length === 0 && loadError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-border p-6 text-center">
              <Icon name="sad" className="h-14 w-14 text-muted" strokeWidth={1.4} />
              <h2 className="text-xl font-black">No pudimos cargar productos</h2>
              <p className="text-sm text-muted">Revisa tu conexión e intenta de nuevo.</p>
              <button
                onClick={() => {
                  setLoading(true);
                  fetchMore();
                }}
                className="rounded-full bg-brand px-5 py-2.5 font-extrabold text-white"
              >
                Reintentar
              </button>
            </div>
          )}
          {!loading && deck.length === 0 && !loadError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-border p-6 text-center">
              <Icon name="party" className="h-14 w-14 text-brand" strokeWidth={1.4} />
              <h2 className="text-xl font-black">¡Viste todo por ahora!</h2>
              <p className="text-sm text-muted">
                {filters.length > 0
                  ? "No quedan productos en estas categorías. Prueba agregando otras o mira todo."
                  : "Subimos tesoros nuevos después de cada mudanza. Vuelve pronto."}
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <Link href="/favoritos" className="rounded-full bg-brand px-5 py-2.5 font-extrabold text-white">
                  Ver mis favoritos
                </Link>
                <button onClick={reviewPassed} className="text-sm font-bold text-muted underline">
                  Volver a ver los que pasé
                </button>
              </div>
            </div>
          )}
          {deck
            .slice(0, 3)
            .reverse()
            .map((p) => {
              const depth = deck.indexOf(p);
              return (
                <SwipeCard
                  key={p.id}
                  product={p}
                  category={cats[p.category_slug]}
                  depth={depth}
                  exit={exit?.id === p.id ? exit.action : null}
                  onSwipe={depth === 0 ? swipe : undefined}
                />
              );
            })}
          {toast && (
            <div className="animate-pop pointer-events-none absolute inset-x-0 top-4 z-50 mx-auto w-fit rounded-full bg-foreground px-4 py-2 text-sm font-bold text-background shadow-lg">
              {toast}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-center gap-4">
          <RoundButton label="Deshacer" onClick={undo} disabled={!last} className="h-12 w-12 text-muted">
            <Icon name="undo" className="h-5 w-5" strokeWidth={2.2} />
          </RoundButton>
          <RoundButton label="Paso" onClick={() => swipe("pass")} disabled={!top} className="h-16 w-16 text-pass">
            <Icon name="x" className="h-8 w-8" strokeWidth={2.6} />
          </RoundButton>
          <RoundButton label="¡Lo quiero!" onClick={() => swipe("superlike")} disabled={!top} className="h-12 w-12 text-star">
            <Icon name="star" className="h-5 w-5" strokeWidth={2.2} fill="currentColor" />
          </RoundButton>
          <RoundButton label="Me gusta" onClick={() => swipe("like")} disabled={!top} className="h-16 w-16 text-accent">
            <Icon name="heart" className="h-8 w-8" strokeWidth={2.2} fill="currentColor" />
          </RoundButton>
          {top ? (
            <Link
              href={`/producto/${top.id}`}
              aria-label="Ver detalle"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-xl shadow-md"
            >
              <Icon name="arrow" className="h-5 w-5" strokeWidth={2.2} />
            </Link>
          ) : (
            <span className="h-12 w-12" />
          )}
        </div>
        <p className="mt-3 hidden text-center text-xs text-muted md:block">
          Atajos: ← paso · → me gusta · ↑ ¡lo quiero!
        </p>
      </div>

      <TasteMeter categories={categories} weights={weights} swipeCount={swipeCount} />

      {superliked && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 md:items-center" onClick={() => setSuperliked(null)}>
          <div className="animate-pop w-full max-w-sm rounded-card bg-card p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <Icon name="star" className="mx-auto h-12 w-12 text-star" strokeWidth={1.6} fill="currentColor" />
            <h2 className="mt-2 text-2xl font-black">¡Te encantó!</h2>
            <p className="mt-1 text-muted">
              <b>{superliked.title}</b> {superliked.quantity > 1 ? `quedan solo ${superliked.quantity}.` : "es pieza única."} Si lo quieres, aparta el tuyo antes que otro.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Link href={`/comprar/${superliked.id}`} className="rounded-full bg-brand py-3 font-extrabold text-white">
                Comprar ahora
              </Link>
              <button onClick={() => setSuperliked(null)} className="py-2 font-bold text-muted">
                Seguir descubriendo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RoundButton({
  children,
  label,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`flex items-center justify-center rounded-full border border-border bg-card font-black shadow-md transition hover:scale-110 active:scale-95 disabled:opacity-30 disabled:hover:scale-100 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function SwipeCard({
  product,
  category,
  depth,
  exit,
  onSwipe,
}: {
  product: Product;
  category?: Category;
  depth: number;
  exit: SwipeAction | null;
  onSwipe?: (a: SwipeAction) => void;
}) {
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [photo, setPhoto] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const isTop = depth === 0;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!isTop || exit) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY };
    setDrag({ x: 0, y: 0, active: true });
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y, active: true });
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const { x, y } = drag;
    start.current = null;
    if (Math.abs(x) < 6 && Math.abs(y) < 6) {
      // Toque: cambiar de foto (izquierda / derecha)
      const rect = e.currentTarget.getBoundingClientRect();
      const rel = (e.clientX - rect.left) / rect.width;
      if (product.images.length > 1) {
        if (rel < 0.35) setPhoto((p) => Math.max(0, p - 1));
        else if (rel > 0.65) setPhoto((p) => Math.min(product.images.length - 1, p + 1));
      }
      setDrag({ x: 0, y: 0, active: false });
      return;
    }
    if (y < -SWIPE_Y && Math.abs(x) < SWIPE_X) onSwipe?.("superlike");
    else if (x > SWIPE_X) onSwipe?.("like");
    else if (x < -SWIPE_X) onSwipe?.("pass");
    setDrag({ x: 0, y: 0, active: false });
  }

  let transform: string;
  if (exit === "like") transform = "translate(150%, -5%) rotate(25deg)";
  else if (exit === "pass") transform = "translate(-150%, -5%) rotate(-25deg)";
  else if (exit === "superlike") transform = "translate(0, -150%) scale(0.9)";
  else if (isTop) transform = `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 14}deg)`;
  else transform = `translateY(${depth * 12}px) scale(${1 - depth * 0.05})`;

  const likeOpacity = exit === "like" ? 1 : Math.max(0, Math.min(1, drag.x / SWIPE_X));
  const passOpacity = exit === "pass" ? 1 : Math.max(0, Math.min(1, -drag.x / SWIPE_X));
  const superOpacity = exit === "superlike" ? 1 : Math.max(0, Math.min(1, -drag.y / SWIPE_Y));
  const flash = isFlashActive(product);

  return (
    <div
      className={`no-overscroll absolute inset-0 flex select-none flex-col overflow-hidden rounded-card bg-card shadow-xl ring-1 ring-black/5 ${
        isTop ? "cursor-grab active:cursor-grabbing" : "pointer-events-none"
      }`}
      style={{
        transform,
        transition: drag.active ? "none" : "transform 0.28s ease-out",
        zIndex: 10 - depth,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Foto completa (sin recortar) sobre gris claro, encima del texto */}
      <div className="relative min-h-0 flex-1 bg-surface">
        <ProductImage product={product} category={category} index={photo} fit="contain" priority={isTop} sizes="400px" />
      </div>

      {product.images.length > 1 && (
        <div className="absolute inset-x-3 top-2 flex gap-1">
          {product.images.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i === photo ? "bg-foreground" : "bg-foreground/20"}`} />
          ))}
        </div>
      )}

      {flash && product.flash_until && (
        <div className="absolute left-3 top-5">
          <FlashCountdown until={product.flash_until} />
        </div>
      )}

      <Stamp text="ME GUSTA" className="left-5 top-14 -rotate-12 border-accent text-accent" opacity={likeOpacity} />
      <Stamp text="PASO" className="right-5 top-14 rotate-12 border-pass text-pass" opacity={passOpacity} />
      <Stamp text="¡LO QUIERO!" className="inset-x-0 bottom-40 mx-auto w-fit border-star text-star" opacity={superOpacity} />

      <div className="shrink-0 border-t border-border bg-card px-5 pb-5 pt-3">
        <div className="mb-1 flex flex-wrap gap-1.5 text-xs font-bold">
          {category && (
            <span className="rounded-full bg-surface px-2 py-0.5">
              {category.name}
            </span>
          )}
          <span className="rounded-full bg-surface px-2 py-0.5">{CONDITION_LABEL[product.condition]}</span>
          {product.comuna && <span className="rounded-full bg-surface px-2 py-0.5"><Icon name="pin" className="mr-0.5 inline h-3 w-3 align-[-1px]" strokeWidth={2.4} />{product.comuna}</span>}
          {product.quantity > 1 && <span className="rounded-full bg-surface px-2 py-0.5">Quedan {product.quantity}</span>}
        </div>
        <h2 className="line-clamp-1 text-xl font-black leading-tight">{product.title}</h2>
        <PriceTag product={product} />
        {product.description && <p className="mt-1 line-clamp-1 text-sm text-muted">{product.description}</p>}
      </div>
    </div>
  );
}

function Stamp({ text, className, opacity }: { text: string; className: string; opacity: number }) {
  return (
    <div
      className={`pointer-events-none absolute rounded-xl border-4 px-3 py-1 text-3xl font-black tracking-wider ${className}`}
      style={{ opacity }}
    >
      {text}
    </div>
  );
}
