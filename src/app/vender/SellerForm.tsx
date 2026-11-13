"use client";

import { startTransition, useActionState, useState } from "react";
import { COMUNAS } from "@/lib/comunas";
import type { Seller } from "@/lib/types";
import { registerSeller, updateMySeller, type SellerFormState } from "./actions";

export function SellerForm({ seller, defaultEmail }: { seller?: Seller; defaultEmail?: string }) {
  const [state, action, pending] = useActionState<SellerFormState, FormData>(
    seller ? updateMySeller : registerSeller,
    {},
  );
  const [comunas, setComunas] = useState<string[]>(seller?.comunas ?? []);
  const [logoPreview, setLogoPreview] = useState<string | null>(seller?.logo_url ?? null);
  const input = "w-full rounded-xl border border-border bg-card px-4 py-3";

  function toggleComuna(c: string) {
    setComunas((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));
  }

  return (
    <form
      // onSubmit (y no action=) para que el formulario no se borre si hay un error
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="space-y-5"
    >
      <fieldset className="grid grid-cols-2 gap-2 rounded-2xl bg-surface p-1 text-sm font-bold">
        {(["persona", "empresa"] as const).map((k) => (
          <label key={k} className="cursor-pointer">
            <input type="radio" name="kind" value={k} defaultChecked={(seller?.kind ?? "persona") === k} className="peer sr-only" />
            <span className="block rounded-xl py-2.5 text-center text-muted peer-checked:bg-background peer-checked:text-foreground peer-checked:shadow">
              {k === "empresa" ? "Empresa" : "Persona"}
            </span>
          </label>
        ))}
      </fieldset>

      <label className="block space-y-1">
        <span className="font-bold">Nombre de la empresa o tu nombre</span>
        <input name="name" required maxLength={80} defaultValue={seller?.name} className={input} placeholder="Ej: Mudanzas El Roble" />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="font-bold">RUT (opcional)</span>
          <input name="rut" maxLength={20} defaultValue={seller?.rut ?? ""} className={input} placeholder="76.123.456-7" />
        </label>
        <label className="block space-y-1">
          <span className="font-bold">Persona de contacto</span>
          <input name="contact_name" maxLength={80} defaultValue={seller?.contact_name ?? ""} className={input} />
        </label>
        <label className="block space-y-1">
          <span className="font-bold">Correo</span>
          <input name="email" type="email" required defaultValue={seller?.email ?? defaultEmail} className={input} />
        </label>
        <label className="block space-y-1">
          <span className="font-bold">Teléfono o WhatsApp</span>
          <input name="phone" type="tel" required defaultValue={seller?.phone} className={input} placeholder="+56 9 1234 5678" />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="font-bold">Cuéntanos de tu empresa (opcional)</span>
        <textarea name="description" rows={3} maxLength={600} defaultValue={seller?.description} className={input} placeholder="Hace cuántos años trabajan, qué tipo de mudanzas hacen…" />
      </label>

      <div className="space-y-2">
        <p className="font-bold">
          Comunas donde trabajas <span className="font-normal text-muted">({comunas.length})</span>
        </p>
        <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto rounded-2xl border border-border p-3">
          {COMUNAS.map((c) => {
            const on = comunas.includes(c);
            return (
              <label key={c} className="cursor-pointer">
                <input type="checkbox" name="comunas" value={c} checked={on} onChange={() => toggleComuna(c)} className="sr-only" />
                <span className={`inline-block rounded-full border px-3 py-1 text-sm font-semibold ${on ? "border-foreground bg-foreground text-background" : "border-border"}`}>
                  {c}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="font-bold">Logo (opcional, solo se ve en tu panel)</p>
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoPreview ? <img src={logoPreview} alt="" className="h-full w-full object-contain" /> : <span className="text-xs text-muted">Sin logo</span>}
          </div>
          <input
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setLogoPreview(URL.createObjectURL(f));
            }}
            className="text-sm"
          />
        </div>
        {seller?.logo_url && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="remove_logo" /> Quitar el logo actual
          </label>
        )}
      </div>

      <fieldset className="space-y-3 rounded-2xl border border-border p-4">
        <legend className="px-1 font-bold">Cuenta para transferirte tus ventas</legend>
        <p className="text-sm text-muted">Puedes completarla después. Solo la ve nuestro equipo.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="bank_holder_name" maxLength={80} defaultValue={seller?.bank_holder_name ?? ""} className={input} placeholder="Titular" />
          <input name="bank_holder_rut" maxLength={20} defaultValue={seller?.bank_holder_rut ?? ""} className={input} placeholder="RUT del titular" />
          <input name="bank_name" maxLength={60} defaultValue={seller?.bank_name ?? ""} className={input} placeholder="Banco (ej: BancoEstado)" />
          <select name="bank_account_type" defaultValue={seller?.bank_account_type ?? ""} className={input}>
            <option value="">Tipo de cuenta</option>
            <option value="rut">CuentaRUT</option>
            <option value="vista">Cuenta vista</option>
            <option value="corriente">Cuenta corriente</option>
            <option value="ahorro">Cuenta de ahorro</option>
          </select>
          <input name="bank_account_number" maxLength={30} defaultValue={seller?.bank_account_number ?? ""} className={`${input} sm:col-span-2`} placeholder="Número de cuenta" />
        </div>
      </fieldset>

      {!seller && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="terms" required className="mt-1" />
          <span>
            Acepto que MÜVEO revise mi tienda antes de publicarla, que mis productos se muestren con la marca MÜVEO y que
            MÜVEO cobre una comisión por cada venta. El pago de cada venta se libera cuando el comprador recibe conforme o
            pasa el plazo de revisión sin reclamos.
          </span>
        </label>
      )}

      {state.error && <p className="rounded-xl bg-pass/10 p-3 text-sm font-bold text-pass">{state.error}</p>}
      {state.ok && <p className="rounded-xl bg-accent/15 p-3 text-sm font-bold text-accent">{state.ok}</p>}

      <button disabled={pending} className="w-full rounded-full bg-brand py-3 text-lg font-extrabold text-white disabled:opacity-60">
        {pending ? "Guardando…" : seller ? "Guardar datos" : "Enviar solicitud"}
      </button>
    </form>
  );
}
