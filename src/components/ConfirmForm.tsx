"use client";

import type { ReactNode } from "react";

/** Formulario que pide confirmación antes de enviar (para borrar o cancelar). */
export function ConfirmForm({
  action,
  message,
  hidden,
  className,
  children,
}: {
  action: (f: FormData) => void | Promise<void>;
  message: string;
  hidden: Record<string, string>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
    </form>
  );
}
