import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/brand";
import { Icon } from "@/components/Icon";
import { InfoPage, Section } from "@/components/info/InfoPage";
import { getContact } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Contacto",
  description: `Escríbenos: correo, WhatsApp y horario de atención de ${brand.name}.`,
  alternates: { canonical: "/contacto" },
};

export default async function ContactoPage() {
  const c = await getContact();
  const cards = [
    { icon: "mail" as const, title: "Correo", value: c.email, href: `mailto:${c.email}` },
    ...(c.whatsappUrl ? [{ icon: "phone" as const, title: "WhatsApp", value: c.whatsapp, href: c.whatsappUrl }] : []),
    { icon: "clock" as const, title: "Horario", value: c.hours, href: null },
    ...(c.address ? [{ icon: "pin" as const, title: "Bodega", value: `${c.address}, ${c.city}`, href: null }] : []),
  ];

  return (
    <InfoPage current="/contacto" eyebrow="Ayuda" title="Hablemos" intro="¿Una duda sobre un producto, tu pedido o una devolución? Te respondemos rápido.">
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((k) => {
          const body = (
            <>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                <Icon name={k.icon} className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm text-muted">{k.title}</span>
                <span className="block truncate font-extrabold">{k.value}</span>
              </span>
            </>
          );
          return k.href ? (
            <a key={k.title} href={k.href} className="flex items-center gap-3 rounded-card border border-border bg-card p-4 no-underline hover:bg-surface" style={{ color: "inherit", textDecoration: "none" }}>
              {body}
            </a>
          ) : (
            <div key={k.title} className="flex items-center gap-3 rounded-card border border-border bg-card p-4">
              {body}
            </div>
          );
        })}
      </div>

      <Section title="Para ayudarte más rápido">
        <p>
          Si es sobre una compra, incluye tu número de compra (lo ves en <Link href="/mis-pedidos">Mis pedidos</Link>). Para cambios o
          devoluciones, revisa primero nuestra <Link href="/devoluciones">política de devoluciones</Link>.
        </p>
      </Section>

      {(c.companyName || c.rut) && (
        <Section title="Datos de la empresa">
          <p>
            {c.companyName}
            {c.rut ? ` · RUT ${c.rut}` : ""}
            {c.address ? ` · ${c.address}, ${c.city}` : ""}
          </p>
        </Section>
      )}
    </InfoPage>
  );
}
