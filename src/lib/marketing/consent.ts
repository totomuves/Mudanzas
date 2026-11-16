/**
 * CONSENTIMIENTO DE COOKIES (Ley 21.719): con el aviso encendido en
 * Admin → Portada, Google Analytics, Meta y TikTok se cargan solo si el
 * visitante elige "Aceptar". La elección se guarda en este navegador por
 * 6 meses; después se vuelve a preguntar. Con el aviso apagado se mide a todos.
 * Las cookies necesarias (sesión, carrito) no dependen de esto.
 */

export type Consent = "granted" | "denied";

const KEY = "muveo-cookies";
/** Si cambian las herramientas o el texto, subir la versión hace que se pregunte de nuevo. */
const VERSION = 1;
const MAX_AGE_DAYS = 182;
const EVENT = "muveo-cookies-change";
const OPEN_EVENT = "muveo-cookies-open";

type Stored = { v: number; c: Consent; t: number };

let cached: Consent | null | undefined;
/** Lo fija <Analytics> según el interruptor del admin. Parte en true por seguridad. */
let required = true;

export function setConsentRequired(value: boolean) {
  required = value;
}

function read(): Consent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    if (s.v !== VERSION || (s.c !== "granted" && s.c !== "denied")) return null;
    if (Date.now() - s.t > MAX_AGE_DAYS * 86_400_000) return null;
    return s.c;
  } catch {
    return null;
  }
}

/** null = todavía no elige. */
export function getConsent(): Consent | null {
  if (cached === undefined) cached = read();
  return cached;
}

/** ¿Se puede medir? Sí si el aviso está apagado o si el visitante aceptó. */
export function hasConsent() {
  return !required || getConsent() === "granted";
}

export function setConsent(c: Consent) {
  const before = getConsent();
  cached = c;
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, c, t: Date.now() } satisfies Stored));
  } catch {
    // Sin almacenamiento: vale solo para esta visita
  }
  if (c === "denied" && before === "granted") revoke();
  window.dispatchEvent(new Event(EVENT));
}

/** Para useSyncExternalStore: avisa cuando cambia la elección (también desde otra pestaña). */
export function subscribeConsent(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cached = read();
    cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Vuelve a mostrar el aviso (link "Preferencias de cookies" del pie de página). */
export function openConsentBanner() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function subscribeOpenBanner(cb: () => void) {
  window.addEventListener(OPEN_EVENT, cb);
  return () => window.removeEventListener(OPEN_EVENT, cb);
}

type Fn = (...args: unknown[]) => void;

/**
 * Si alguien aceptó y luego rechaza: se avisa a cada herramienta, se borran
 * sus cookies y se recarga la página para que sus scripts dejen de correr.
 */
function revoke() {
  const w = window as Window & { gtag?: Fn; fbq?: Fn; ttq?: { revokeConsent?: () => void } };
  try {
    w.gtag?.("consent", "update", {
      ad_storage: "denied",
      analytics_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  } catch {}
  try {
    w.fbq?.("consent", "revoke");
  } catch {}
  try {
    w.ttq?.revokeConsent?.();
  } catch {}

  const names = document.cookie
    .split(";")
    .map((c) => c.split("=")[0].trim())
    .filter((n) => /^(_ga|_gid|_gat|_gcl|_fbp|_fbc|_ttp|_tt_|ttcsid|tt_)/.test(n));
  const host = location.hostname;
  const domains = ["", host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
  for (const n of names) {
    for (const d of domains) {
      document.cookie = `${n}=; Max-Age=0; path=/${d ? `; domain=${d}` : ""}`;
    }
  }
  setTimeout(() => location.reload(), 50);
}
