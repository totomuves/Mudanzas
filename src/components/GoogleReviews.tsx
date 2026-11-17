"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import type { ReviewsData } from "@/lib/google-reviews";

export function Stars({ className = "h-4 w-4", color = "text-star", value = 5 }: { className?: string; color?: string; value?: number }) {
  return (
    <span className={`flex gap-0.5 ${color}`} aria-label={`${value} de 5 estrellas`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Icon key={i} name="star" className={`${className} ${i < Math.round(value) ? "fill-current" : "opacity-30"}`} strokeWidth={1.5} />
      ))}
    </span>
  );
}

/**
 * Reseñas de Google (src/lib/google-reviews.ts: sincronizadas con Google + las copiadas a mano).
 * Se usa en Conócenos y bajo el cotizador, así las dos páginas muestran lo mismo.
 * Avanzan solas cada pocos segundos; se detienen si la persona las toca o pasa el mouse.
 */
export function GoogleReviews({ data, id, title = "Lo que dicen nuestros clientes" }: { data: ReviewsData; id?: string; title?: string }) {
  const list = useRef<HTMLUListElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const el = list.current;
    if (!el || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      const card = el.querySelector("li");
      const step = card ? card.getBoundingClientRect().width + 16 : el.clientWidth;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
      el.scrollTo({ left: atEnd ? 0 : el.scrollLeft + step, behavior: "smooth" });
    }, 4500);
    return () => window.clearInterval(timer);
  }, [paused]);

  const move = (dir: 1 | -1) => {
    const el = list.current;
    if (!el) return;
    setPaused(true);
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <section id={id} className="scroll-mt-24 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Reseñas en Google</p>
          <h2 className="text-2xl font-black">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <a href={data.url} target="_blank" rel="noopener" className="flex items-center gap-3 rounded-full border border-border px-4 py-2 text-sm font-bold hover:bg-surface">
            <span className="text-xl font-black">{data.rating}</span>
            <Stars />
            {data.count !== null && <span className="font-normal text-muted">({data.count})</span>}
            <span className="flex items-center gap-1">Ver en Google <Icon name="external" className="h-4 w-4" strokeWidth={2} /></span>
          </a>
          <button type="button" onClick={() => move(-1)} aria-label="Reseñas anteriores" className="hidden rounded-full border border-border p-2 hover:bg-surface md:block">
            <Icon name="back" className="h-4 w-4" strokeWidth={2.2} />
          </button>
          <button type="button" onClick={() => move(1)} aria-label="Más reseñas" className="hidden rounded-full border border-border p-2 hover:bg-surface md:block">
            <Icon name="arrow" className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>
      </div>
      <ul
        ref={list}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onFocus={() => setPaused(true)}
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {data.reviews.map((r) => (
          <li key={r.name} className="flex w-72 shrink-0 snap-start flex-col gap-3 rounded-card bg-surface p-5 md:w-[calc((100%-2rem)/3)]">
            <div className="flex items-center justify-between">
              <Stars value={r.rating} />
              <Icon name="quote" className="h-5 w-5 text-muted" strokeWidth={1.6} />
            </div>
            <blockquote className="line-clamp-6 flex-1 text-sm">“{r.text}”</blockquote>
            <div className="flex items-center gap-2">
              {r.photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.photo} alt="" width={28} height={28} referrerPolicy="no-referrer" className="h-7 w-7 rounded-full" />
              )}
              <div>
                <p className="text-sm font-extrabold">{r.name}</p>
                {r.when && <p className="text-xs text-muted">{r.when} en Google</p>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
