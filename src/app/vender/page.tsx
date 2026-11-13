import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { brand } from "@/brand";
import { hasSupabaseEnv } from "@/lib/env";
import { getMarketplaceEnabled, getMySeller } from "@/lib/seller";
import { SetupNotice } from "@/components/SetupNotice";
import { Icon, type IconName } from "@/components/Icon";
import { SellerForm } from "./SellerForm";

export const metadata: Metadata = {
  title: "Vende con nosotros",
  description: "Vende tus cosas o lo que te dejan tus clientes de mudanza: fotos con fondo blanco y compradores que ya buscan lo que tienes.",
};

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "store", title: "Regístrate", text: "Como persona o empresa. Te toma dos minutos y revisamos tu solicitud." },
  { icon: "camera", title: "Sube tus productos", text: "Desde el celular: la IA deja la foto con fondo blanco y te ayuda con la descripción." },
  { icon: "bag", title: "Nosotros los vendemos", text: `Se publican en ${brand.name} y la app se los muestra a quienes les gusta justo eso.` },
  { icon: "check", title: "Recibe tu pago", text: "Cuando el comprador recibe conforme, te transferimos la venta menos nuestra comisión." },
];

export default async function VenderPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  // Con el marketplace apagado esta página no existe
  if (!(await getMarketplaceEnabled())) notFound();
  const { user, seller } = await getMySeller();
  if (seller) redirect("/vendedor");

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <section className="space-y-3">
        <p className="text-sm font-bold uppercase tracking-widest text-muted">Vende con {brand.name}</p>
        <h1 className="text-3xl font-black leading-tight md:text-4xl">Vende lo que ya no usas, o lo que te dejan tus clientes de mudanza.</h1>
        <p className="text-lg text-muted">
          Muebles, electro y cosas en buen estado. Tú les sacas una foto, nosotros las dejamos impecables y las vendemos. Pueden
          vender personas y empresas de mudanza.
        </p>
      </section>

      <section className="grid gap-5 sm:grid-cols-2">
        {STEPS.map((s) => (
          <div key={s.title} className="flex gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface">
              <Icon name={s.icon} className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-extrabold">{s.title}</h2>
              <p className="text-sm text-muted">{s.text}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-4 rounded-card border border-border bg-card p-5 md:p-8">
        <h2 className="text-2xl font-black">Registra tu tienda</h2>
        {user ? (
          <SellerForm defaultEmail={user.email} />
        ) : (
          <div className="space-y-3">
            <p className="text-muted">Primero ingresa con tu correo. Te mandamos un enlace, sin contraseñas.</p>
            <Link
              href="/ingresar?next=/vender"
              className="flex items-center justify-center gap-2 rounded-full bg-brand py-3 font-extrabold text-white"
            >
              <Icon name="login" className="h-5 w-5" strokeWidth={2.2} /> Ingresar para registrarme
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
