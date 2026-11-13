/** Punto de color + texto para mostrar estados. */
const TONES = {
  ok: "bg-accent",
  warn: "bg-brand",
  info: "bg-star",
  off: "bg-muted",
  bad: "bg-pass",
} as const;

export type StatusTone = keyof typeof TONES;

export function StatusDot({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${TONES[tone]}`} aria-hidden />
      {label}
    </span>
  );
}
