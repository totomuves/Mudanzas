import type { Metadata } from "next";
import { brand } from "@/brand";
import { Icon, type IconName } from "@/components/Icon";
import { COMUNAS } from "@/lib/comunas";
import { RequestForm } from "./RequestForm";

export const metadata: Metadata = {
  title: "Retiramos lo que ya no usas",
  description: `¿Tienes muebles o cosas que ya no usas? Mándanos fotos y ${brand.name} pasa a buscarlas sin costo.`,
  alternates: { canonical: "/retiramos" },
};

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "camera", title: "Mándanos fotos", text: "Y la dirección donde está." },
  { icon: "check", title: "Te confirmamos", text: "Por WhatsApp, con el día en que pasamos." },
  { icon: "truck", title: "Lo retiramos", text: "Sin costo. Firmas en el celular del chofer y listo." },
];

export default function RetiramosPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-2">
        <p className="text-sm font-bold uppercase tracking-widest text-brand">Sin costo</p>
        <h1 className="text-3xl font-black md:text-4xl">¿Quieres que retiremos algo?</h1>
        <p className="text-lg text-muted">
          Muebles, electrodomésticos o cosas que ya no usas. Si nos sirve, pasamos a buscarlo y le damos una segunda vida.
        </p>
        <p className="flex items-start gap-2 rounded-2xl border-2 border-foreground p-3 font-bold">
          <Icon name="verified" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          Solo retiramos cosas en buen estado y funcionando.
        </p>
      </div>

      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-card bg-surface p-4 sm:flex-col">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-background">
              <Icon name={s.icon} className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-extrabold">{i + 1}. {s.title}</span>
              <span className="block text-sm text-muted">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>

      <RequestForm comunas={COMUNAS} />

      <p className="text-sm text-muted">
        Revisamos cada solicitud. No retiramos cosas rotas, con fallas, muy gastadas o que no caben en el vehículo. Si no podemos, te avisamos igual.
      </p>
    </div>
  );
}
