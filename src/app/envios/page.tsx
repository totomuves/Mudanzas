import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/brand";
import { Bullets, InfoPage, Section } from "@/components/info/InfoPage";
import { getContact } from "@/lib/contact";
import { getShippingConfig } from "@/lib/data";
import { hasSupabaseEnv } from "@/lib/env";
import { formatCLP } from "@/lib/format";

export const metadata: Metadata = {
  title: "Envíos y retiro",
  description: `Despacho a domicilio en ${brand.legal.city} por comuna, o retiro sin costo. Precios, plazos y cómo funciona la entrega en ${brand.name}.`,
  alternates: { canonical: "/envios" },
};

export default async function EnviosPage() {
  const [c, config] = await Promise.all([getContact(), hasSupabaseEnv() ? getShippingConfig() : Promise.resolve(null)]);
  const auto = config?.mode === "automatico";
  // Con precio automático no hay tabla: el precio depende de la distancia
  const rates = !auto && config ? (config.rates as { comuna: string; price: number }[]) : [];
  const min = config && (auto || rates.length) ? config.minPrice : null;

  return (
    <InfoPage
      current="/envios"
      eyebrow="Ayuda"
      title="Envíos y retiro"
      intro="Te lo llevamos a la puerta con nuestro propio equipo, o lo retiras tú sin costo."
      highlights={[
        {
          icon: "truck",
          title: min ? `Despacho desde ${formatCLP(min)}` : auto ? "Despacho según distancia" : "Despacho por comuna",
          text: auto ? "El precio depende de la distancia a tu dirección y lo ves antes de pagar." : "El precio depende de tu comuna y lo ves antes de pagar.",
        },
        { icon: "calendar", title: "1 a 4 días hábiles", text: "Te mostramos la fecha estimada al pagar. Repartimos de lunes a sábado." },
        { icon: "warehouse", title: "Retiro sin costo", text: "Coordinamos contigo el día y la hora." },
      ]}
    >
      <Section title="Despacho a domicilio">
        <Bullets
          items={[
            "Elige “Despacho” al pagar, escribe tu dirección y comuna, y elige si prefieres recibir en la mañana o en la tarde.",
            "Antes de pagar ves la fecha estimada de entrega y el costo exacto.",
            "Si compras varios productos en un mismo carrito, pagas un solo despacho y llega todo junto (salvo productos de tiendas asociadas, que despachan por separado).",
            "El día de la entrega puedes seguir el reparto desde tu pedido. Al entregar, quien recibe firma y dejamos una foto como comprobante.",
            "Llevamos el producto hasta la puerta. Si hay que subir por escalera muebles grandes o armar algo, avísanos antes y lo coordinamos.",
          ]}
        />
      </Section>

      {rates.length > 0 && (
        <Section title="Comunas y precios">
          <div className="overflow-hidden rounded-card border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Comuna</th>
                  <th className="px-4 py-2.5 text-right font-bold">Despacho</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rates.map((r) => (
                  <tr key={r.comuna}>
                    <td className="px-4 py-2.5">{r.comuna}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{formatCLP(r.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted">¿Tu comuna no aparece? Escríbenos y vemos cómo hacerlo llegar.</p>
        </Section>
      )}

      <Section title="Retiro">
        <p>
          Elige “Retiro” al pagar y te escribimos por WhatsApp para coordinar el día y la hora
          {c.address ? (
            <>
              {" "}en <b>{c.address}</b>
            </>
          ) : null}
          . Trae tu número de compra. Para muebles grandes te recomendamos venir en un vehículo adecuado.
        </p>
      </Section>

      <Section title="Si no hay nadie para recibir">
        <p>
          Te llamamos o escribimos al llegar. Si no podemos entregar, reprogramamos contigo sin costo la primera vez. Desde el segundo
          intento fallido se cobra un nuevo despacho.
        </p>
      </Section>

      <Section title="¿Dudas con tu entrega?">
        <p>
          Revisa el estado en <Link href="/mis-pedidos">Mis pedidos</Link> o escríbenos a <a href={`mailto:${c.email}`}>{c.email}</a>
          {c.whatsappUrl && (
            <>
              {" "}o por <a href={c.whatsappUrl}>WhatsApp</a>
            </>
          )}
          .
        </p>
      </Section>
    </InfoPage>
  );
}
