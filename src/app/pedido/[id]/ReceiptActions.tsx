"use client";

import { useActionState, useState } from "react";
import { confirmReceipt, reportIssue, type ReceiptState } from "./actions";

/** El comprador confirma que recibió bien o reporta un problema (el pago al vendedor sigue retenido). */
export function ReceiptActions({ orderId, reviewDays, releaseAt }: { orderId: string; reviewDays: number; releaseAt: string | null }) {
  const [confirmState, confirmAction, confirming] = useActionState<ReceiptState, FormData>(confirmReceipt, {});
  const [issueState, issueAction, reporting] = useActionState<ReceiptState, FormData>(reportIssue, {});
  const [showIssue, setShowIssue] = useState(false);
  const done = confirmState.ok || issueState.ok;

  if (done) return <p className="rounded-xl bg-accent/15 p-3 text-sm font-bold text-accent">{done}</p>;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4 text-left">
      <p className="font-extrabold">¿Recibiste tu compra en buen estado?</p>
      <p className="text-sm text-muted">
        {releaseAt
          ? `Tienes hasta el ${new Date(releaseAt).toLocaleDateString("es-CL", { dateStyle: "medium" })} para avisarnos si hay un problema.`
          : `Cuando la recibas, tienes ${reviewDays} días para revisarla y avisarnos si hay un problema.`}{" "}
        Mientras tanto, guardamos tu pago.
      </p>
      <form action={confirmAction}>
        <input type="hidden" name="orderId" value={orderId} />
        <button disabled={confirming} className="w-full rounded-full bg-brand py-3 font-extrabold text-white disabled:opacity-60">
          {confirming ? "…" : "Sí, recibí todo bien"}
        </button>
      </form>
      {confirmState.error && <p className="text-sm font-bold text-pass">{confirmState.error}</p>}
      {showIssue ? (
        <form action={issueAction} className="space-y-2">
          <input type="hidden" name="orderId" value={orderId} />
          <textarea
            name="text"
            rows={3}
            maxLength={1000}
            required
            placeholder="¿Qué pasó? Llegó dañado, no es lo de la foto, quiero devolverlo…"
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
          />
          <button disabled={reporting} className="w-full rounded-full border-2 border-pass py-2.5 font-extrabold text-pass disabled:opacity-60">
            {reporting ? "Enviando…" : "Enviar reclamo"}
          </button>
          {issueState.error && <p className="text-sm font-bold text-pass">{issueState.error}</p>}
        </form>
      ) : (
        <button type="button" onClick={() => setShowIssue(true)} className="w-full text-sm font-bold text-muted underline underline-offset-4">
          Tengo un problema o quiero devolverlo
        </button>
      )}
    </div>
  );
}
