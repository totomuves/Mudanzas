"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/Icon";
import { anyTracking } from "@/lib/marketing/config";
import { getConsent, subscribeConsent } from "@/lib/marketing/consent";
import { MOVE_WHEN, MOVING_STEPS, quietPath, signalForPath, type MoveWhen, type PromptState } from "@/lib/moving-leads";
import { answerMovingPrompt, closeMovingStep, getMovingPrompt, logMovingVisit } from "@/app/moving-prompt-actions";

/** Espera antes de aparecer, para no interrumpir apenas carga la página. */
const DELAY_MS = 6000;

/**
 * "¿Te cambias de casa?": aparece abajo a quien parece que se cambia
 * (el puntaje lo calcula la base de datos). Si dice que sí, cada visita
 * le muestra una idea nueva: cotizar, retiro gratis, créditos y recordatorio.
 */
export function MovingPrompt({ cookieConsentRequired }: { cookieConsentRequired: boolean }) {
  const pathname = usePathname();
  const [state, setState] = useState<PromptState>({ show: null });
  const asked = useRef(false);

  // Las visitas a mudanzas, cotizador y retiros suman puntos
  useEffect(() => {
    if (signalForPath(pathname)) logMovingVisit(pathname).catch(() => {});
  }, [pathname]);

  // Una consulta por visita (al cargar la web), lejos de las páginas donde molesta
  useEffect(() => {
    if (asked.current || quietPath(pathname)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      asked.current = true;
      getMovingPrompt()
        .then((s) => {
          if (!cancelled) setState(s);
        })
        .catch(() => {});
    }, DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pathname]);

  // No encima del aviso de cookies: espera a que la persona elija
  const consentPending = useSyncExternalStore(subscribeConsent, () => getConsent() === null, () => true);
  if (state.show === null || quietPath(pathname)) return null;
  if (cookieConsentRequired && anyTracking && consentPending) return null;

  const hide = () => setState({ show: null });

  return (
    <section
      aria-labelledby="moving-prompt-title"
      className="fixed inset-x-3 z-40 mx-auto max-w-md rounded-card border border-border bg-card p-5 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] shadow-[0_8px_30px_rgba(18,18,18,0.12)] md:inset-x-auto md:bottom-5 md:right-5"
    >
      <div className="mb-3 h-1 w-12 rounded-full bg-gradient-to-r from-brand via-brand-2 to-accent" aria-hidden />
      {state.show === "pregunta" ? (
        <Question onDone={(next) => (next.show === null ? hide() : setState(next))} />
      ) : (
        <Step step={state.step} offer={state.offer} onClose={hide} />
      )}
    </section>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Cerrar" className="absolute right-3 top-3 rounded-full p-2 text-muted hover:bg-surface hover:text-foreground">
      <Icon name="x" className="h-4 w-4" strokeWidth={2.2} />
    </button>
  );
}

const btn = "rounded-full border-2 border-foreground px-4 py-2.5 text-sm font-bold disabled:opacity-50";

function Question({ onDone }: { onDone: (next: PromptState) => void }) {
  const [yes, setYes] = useState(false);
  const [when, setWhen] = useState<MoveWhen | null>(null);
  const [contactOk, setContactOk] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);

  const send = async (answer: "si" | "no" | "despues" | "cerrar") => {
    setPending(true);
    const next = await answerMovingPrompt({ answer, when: when ?? undefined, contactOk, name, phone }).catch(
      () => ({ show: null }) as PromptState,
    );
    setPending(false);
    onDone(next);
  };

  if (!yes) {
    return (
      <div className="relative">
        <CloseButton onClick={() => send("cerrar")} />
        <div className="flex items-start gap-3 pr-8">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface">
            <Icon name="home" className="h-5 w-5" />
          </span>
          <div>
            <h2 id="moving-prompt-title" className="text-base font-black">
              ¿Te cambias de casa?
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-foreground/80">
              Si se viene un cambio, te podemos ayudar con el traslado y con lo que te falte en la casa nueva.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button type="button" disabled={pending} onClick={() => send("no")} className={`${btn} bg-card hover:bg-surface`}>
            No
          </button>
          <button type="button" disabled={pending} onClick={() => send("despues")} className={`${btn} bg-card px-2 hover:bg-surface`}>
            Más adelante
          </button>
          <button type="button" disabled={pending} onClick={() => setYes(true)} className={`${btn} bg-foreground text-background`}>
            Sí
          </button>
        </div>
      </div>
    );
  }

  const phoneOk = phone.replace(/\D/g, "").length >= 8;
  return (
    <form
      className="relative space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        send("si");
      }}
    >
      <CloseButton onClick={() => send("cerrar")} />
      <h2 id="moving-prompt-title" className="pr-8 text-base font-black">
        ¡Buena! ¿Cuándo te cambias?
      </h2>
      <div className="flex flex-wrap gap-2">
        {MOVE_WHEN.map((w) => (
          <button
            key={w.key}
            type="button"
            onClick={() => setWhen(w.key)}
            aria-pressed={when === w.key}
            className={`rounded-full border px-3 py-1.5 text-sm font-bold ${when === w.key ? "border-foreground bg-foreground text-background" : "border-border bg-card"}`}
          >
            {w.label}
          </button>
        ))}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={contactOk} onChange={(e) => setContactOk(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
        <span>Quiero que me escriban por WhatsApp para ayudarme con la mudanza.</span>
      </label>
      {contactOk && (
        <div className="grid grid-cols-2 gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
            maxLength={80}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+56 9 1234 5678"
            inputMode="tel"
            maxLength={20}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      )}
      <p className="text-xs text-muted">Te iremos contando, de a poco y aquí mismo, cómo te podemos ayudar.</p>
      <button type="submit" disabled={pending || (contactOk && !phoneOk)} className={`${btn} w-full bg-foreground text-background`}>
        Listo
      </button>
    </form>
  );
}

function Step({ step, offer, onClose }: { step: number; offer: string; onClose: () => void }) {
  const s = MOVING_STEPS[step - 1];
  if (!s) return null;
  const close = (stop: boolean) => {
    closeMovingStep(stop).catch(() => {});
    onClose();
  };
  return (
    <div className="relative">
      <CloseButton onClick={() => close(false)} />
      <p className="text-xs font-bold uppercase tracking-wide text-muted">
        Consejo {step} de {MOVING_STEPS.length}
      </p>
      <div className="mt-2 flex items-start gap-3 pr-6">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface">
          <Icon name={s.icon} className="h-5 w-5" />
        </span>
        <div>
          <h2 id="moving-prompt-title" className="text-base font-black">
            {s.title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-foreground/80">{s.text}</p>
          {step === 4 && offer && <p className="mt-2 rounded-xl bg-brand-soft px-3 py-2 text-sm font-bold">{offer}</p>}
        </div>
      </div>
      <Link href={s.href} onClick={() => close(false)} className={`${btn} mt-4 flex items-center justify-center gap-2 bg-foreground text-background`}>
        {s.cta}
        <Icon name="arrow" className="h-4 w-4" />
      </Link>
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>{step < MOVING_STEPS.length ? "El próximo consejo, en tu siguiente visita." : "Este es el último consejo."}</span>
        <button type="button" onClick={() => close(true)} className="font-semibold underline underline-offset-2 hover:text-foreground">
          No mostrar más
        </button>
      </div>
    </div>
  );
}
