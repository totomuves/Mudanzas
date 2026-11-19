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

/** "1 crédito" / "25 créditos" */
export function formatCredits(n: number) {
  const v = Math.max(0, Math.round(n));
  return `${v.toLocaleString("es-CL")} ${v === 1 ? "crédito" : "créditos"}`;
}

/** Precio por unidad en créditos (redondeado hacia arriba, mínimo 1). */
export function creditPrice(pesos: number, creditValue: number) {
  return Math.max(1, Math.ceil(pesos / Math.max(1, creditValue)));
}
