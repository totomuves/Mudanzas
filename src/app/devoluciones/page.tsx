import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/brand";
import { Bullets, InfoPage, Section } from "@/components/info/InfoPage";
import { getContact } from "@/lib/contact";
import { getMarketplaceEnabled } from "@/lib/seller";
import { hasSupabaseEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "Cambios y devoluciones",
  description: `Política de cambios y devoluciones de ${brand.name}: ${brand.legal.returnDays} días para arrepentirte, garantía y reembolsos con Mercado Pago.`,
  alternates: { canonical: "/devoluciones" },
};

export default async function DevolucionesPage() {
  const c = await getContact();
  const days = brand.legal.returnDays;
  const marketplace = hasSupabaseEnv() ? await getMarketplaceEnabled().catch(() => false) : false;

  return (
    <InfoPage
      current="/devoluciones"
      eyebrow="Ayuda"
      title="Cambios y devoluciones"
      intro="Cada pieza es única y la revisamos antes de publicarla. Si algo no resulta como esperabas, lo resolvemos contigo."
      highlights={[
        { icon: "undo", title: `${days} días para arrepentirte`, text: "Desde que lo recibes, si está igual a como llegó." },
        { icon: "verified", title: "Llegó distinto o con falla", text: "Si no estaba informado en la ficha, lo retiramos sin costo." },
        { icon: "bag", title: "Reembolso con Mercado Pago", text: "Al mismo medio de pago con que compraste." },
      ]}
    >
      <Section title="1. Derecho a retracto">
        <p>
          Como toda compra online en Chile, puedes arrepentirte dentro de <b>{days} días corridos</b> desde que recibes el producto
          (artículo 3 bis de la Ley 19.496 de Protección de los Derechos de los Consumidores).
        </p>
        <Bullets
          items={[
            "El producto debe estar en el mismo estado en que lo recibiste, sin uso adicional y con sus partes y accesorios.",
            "Escríbenos antes de que se cumpla el plazo con tu número de compra.",
            "Coordinamos el retiro o la entrega en nuestra bodega. Si te arrepientes sin que haya un problema con el producto, el costo de retiro es el mismo que el del despacho a tu comuna (lo descontamos del reembolso). Si lo traes tú, no tiene costo.",
          ]}
        />
      </Section>

      <Section title="2. Si llegó con un problema">
        <p>
          Nuestros productos pueden ser nuevos o usados, y en cada ficha indicamos su estado con fotos reales (nuevo, como nuevo,
          buen estado o con detalles). Los detalles informados en la ficha son parte del precio y no son motivo de devolución.
        </p>
        <Bullets
          items={[
            "Si el producto llega dañado, no funciona o es distinto a lo publicado (y eso no estaba informado), avísanos dentro de los primeros 10 días con fotos o un video.",
            "Eliges tú: cambio por un producto equivalente si tenemos, o devolución total del dinero, incluido el despacho.",
            "En ese caso el retiro es por nuestra cuenta.",
            "Los productos nuevos tienen además la garantía legal de 6 meses por fallas de fabricación.",
          ]}
        />
      </Section>

      {marketplace && (
        <Section title="3. Productos de otras tiendas">
          <p>
            Algunos productos los venden tiendas asociadas que despachan ellas mismas. Para cuidarte, <b>el pago queda retenido</b> hasta
            que confirmas que recibiste todo bien. Si hay un problema, repórtalo desde tu pedido en <Link href="/mis-pedidos">Mis pedidos</Link>{" "}
            antes de que se cumpla el plazo de revisión, y nosotros mediamos con la tienda. Las mismas reglas de esta página aplican a
            esas compras.
          </p>
        </Section>
      )}

      <Section title={`${marketplace ? 4 : 3}. Cómo pedir una devolución`}>
        <Bullets
          items={[
            <>
              Escríbenos a <a href={`mailto:${c.email}`}>{c.email}</a>
              {c.whatsappUrl && (
                <>
                  {" "}o por <a href={c.whatsappUrl}>WhatsApp</a>
                </>
              )}{" "}
              con tu número de compra (lo ves en <Link href="/mis-pedidos">Mis pedidos</Link>) y el motivo.
            </>,
            "Te respondemos dentro de 2 días hábiles y coordinamos el retiro o la entrega.",
            "Revisamos el producto al recibirlo (normalmente el mismo día).",
          ]}
        />
      </Section>

      <Section title={`${marketplace ? 5 : 4}. Reembolsos`}>
        <p>
          Devolvemos el dinero con Mercado Pago al mismo medio de pago que usaste, dentro de 5 días hábiles desde que recibimos el
          producto. Con tarjeta de crédito puede tardar uno o dos ciclos de facturación en verse, según tu banco. Si la compra tenía
          varios productos, devolvemos solo los que corresponden.
        </p>
      </Section>

      <Section title={`${marketplace ? 6 : 5}. Si no estás conforme`}>
        <p>
          Siempre intentamos resolverlo directamente. Igualmente puedes acudir al{" "}
          <a href="https://www.sernac.cl" target="_blank" rel="noopener noreferrer">SERNAC</a>.
        </p>
      </Section>
    </InfoPage>
  );
}
