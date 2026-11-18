import { randomInt } from "node:crypto";

/** Letras y números sin los que se confunden (0/O, 1/I/L). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Código nuevo de 10 caracteres (se guarda sin guiones). */
export function newCreditCode() {
  return Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

/** Lo que escribe la persona, sin espacios ni guiones y en mayúsculas. */
export function normalizeCreditCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

/** ABCDE-FGHJK, más fácil de dictar y copiar. */
export function formatCreditCode(code: string) {
  return code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
}

export type CreditStatus = "pendiente" | "activo" | "anulado";

export type StoreCredit = {
  id: string;
  code: string;
  amount: number;
  pickup_id: string | null;
  holder_name: string;
  holder_phone: string | null;
  holder_email: string | null;
  status: CreditStatus;
  activated_at: string | null;
  expires_at: string | null;
  note: string | null;
  created_at: string;
};

export const CREDIT_FIELDS = "id, code, amount, pickup_id, holder_name, holder_phone, holder_email, status, activated_at, expires_at, note, created_at";

export function formatCreditDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CL", { timeZone: "America/Santiago", day: "numeric", month: "long", year: "numeric" });
}
