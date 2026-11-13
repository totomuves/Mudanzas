"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CONDITION_LABEL, isFlashActive } from "@/lib/format";
import type { Category, Product, SwipeAction, UserCategory } from "@/lib/types";
import { ProductImage } from "@/components/ProductImage";
import { PriceTag } from "@/components/PriceTag";
import { FlashCountdown } from "@/components/FlashCountdown";
import { TasteMeter } from "./TasteMeter";

// Mismos valores que el trigger learn_from_swipe en la base de datos
const DELTA: Record<SwipeAction, number> = { superlike: 2, like: 1, pass: -0.4 };
const SWIPE_X = 110;
const SWIPE_Y = 130;

const LIKE_MESSAGES = [
  "¡Buen ojo! 👀",
  "Guardado en favoritos ❤️",
  "Ese tiene tu nombre ✨",
  "¡Anotado! Te mostraré más así",
  "Uff, joyita 💎",
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

  const seen = useRef(new Set<string>());
  const fetching = useRef(false);

  const fetchMore = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    const { data, error } = await supabase.rpc("get_feed", { p_limit: 15 });
    fetching.current = false;
    setLoading(false);
    if (error) {
      setToast("No pudimos cargar productos 😕");
      return;
    }
    const fresh = ((data ?? []) as Product[]).filter((p) => !seen.current.has(p.id));
    fresh.forEach((p) => seen.current.add(p.id));
    if (fresh.length === 0) setExhausted(true);
    setDeck((d) => [...d, ...fresh]);
  }, [supabase]);

  useEffect(() => {
    // Carga inicial del mazo
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      <div className="mx-auto w-full max-w-sm">
        <div className="relative aspect-[3/4.2] w-full">
          {loading && deck.length === 0 && (
            <div className="absolute inset-0 animate-pulse rounded-3xl bg-border" />
          )}
          {!loading && deck.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border p-6 text-center">
              <div className="text-6xl">🎉</div>
              <h2 className="text-xl font-black">¡Viste todo por ahora!</h2>
              <p className="text-sm text-muted">Subimos tesoros nuevos después de cada mudanza. Vuelve pronto.</p>
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
          <RoundButton label="Deshacer" onClick={undo} disabled={!last} className="h-12 w-12 text-xl text-yellow-500">
            ↺
          </RoundButton>
          <RoundButton label="Paso" onClick={() => swipe("pass")} disabled={!top} className="h-16 w-16 text-3xl text-pass">
            ✕
          </RoundButton>
          <RoundButton label="¡Lo quiero!" onClick={() => swipe("superlike")} disabled={!top} className="h-12 w-12 text-xl text-star">
            ★
          </RoundButton>
          <RoundButton label="Me gusta" onClick={() => swipe("like")} disabled={!top} className="h-16 w-16 text-3xl text-accent">
            ♥
          </RoundButton>
          {top ? (
            <Link
              href={`/producto/${top.id}`}
              aria-label="Ver detalle"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-xl shadow-md"
            >
              ℹ️
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
          <div className="animate-pop w-full max-w-sm rounded-3xl bg-card p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-5xl">⭐</div>
            <h2 className="mt-2 text-2xl font-black">¡Te encantó!</h2>
            <p className="mt-1 text-muted">
              <b>{superliked.title}</b> es pieza única. Si lo quieres, aparta el tuyo antes que otro.
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
      className={`no-overscroll absolute inset-0 select-none overflow-hidden rounded-3xl bg-card shadow-xl ring-1 ring-black/5 ${
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
      <ProductImage product={product} category={category} index={photo} priority={isTop} sizes="400px" />

      {product.images.length > 1 && (
        <div className="absolute inset-x-3 top-2 flex gap-1">
          {product.images.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i === photo ? "bg-white" : "bg-white/40"}`} />
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

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent p-5 pt-16 text-white">
        <div className="mb-1 flex flex-wrap gap-1.5 text-xs font-bold">
          {category && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 backdrop-blur">
              {category.emoji} {category.name}
            </span>
          )}
          <span className="rounded-full bg-white/20 px-2 py-0.5 backdrop-blur">{CONDITION_LABEL[product.condition]}</span>
          {product.comuna && <span className="rounded-full bg-white/20 px-2 py-0.5 backdrop-blur">📍 {product.comuna}</span>}
        </div>
        <h2 className="text-2xl font-black leading-tight drop-shadow">{product.title}</h2>
        <div className="[&_.text-muted]:text-white/70 [&_.text-brand]:text-yellow-300">
          <PriceTag product={product} />
        </div>
        {product.description && <p className="mt-1 line-clamp-2 text-sm text-white/85">{product.description}</p>}
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
