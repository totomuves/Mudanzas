import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/brand";
import { Bullets, InfoPage, Section } from "@/components/info/InfoPage";
import { getContact } from "@/lib/contact";
import { getMarketplaceEnabled } from "@/lib/seller";
import { hasSupabaseEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description: `Condiciones de compra en ${brand.name}: productos, precios, pagos, entregas y devoluciones.`,
  alternates: { canonical: "/terminos" },
};

export default async function TerminosPage() {
  const c = await getContact();
  const marketplace = hasSupabaseEnv() ? await getMarketplaceEnabled().catch(() => false) : false;
  let n = 0;
  const t = (title: string) => `${++n}. ${title}`;

  return (
    <InfoPage
      current="/terminos"
      eyebrow="Legal"
      title="Términos y condiciones"
      intro={`Las reglas para comprar en ${brand.name}, en simple. Al comprar aceptas estas condiciones.`}
    >
      <Section title={t("Quiénes somos")}>
        <p>
          {brand.name} es una tienda online de muebles, electrodomésticos, decoración y más, operada por {c.owner}
          {c.rut ? `, RUT ${c.rut}` : ""}
          {c.address ? `, con domicilio en ${c.address}, ${c.city}` : ""}. Contacto: <a href={`mailto:${c.email}`}>{c.email}</a>.
        </p>
      </Section>

      <Section title={t("Los productos")}>
        <Bullets
          items={[
            "Muchos productos son piezas únicas, nuevas o usadas. En cada ficha indicamos su estado (nuevo, como nuevo, buen estado o con detalles) con fotos reales del producto.",
            "Los detalles de uso informados en la ficha o visibles en las fotos son parte del producto y de su precio.",
            "Las medidas y pesos son aproximados. Si una medida es importante para ti, pregúntanos antes de comprar.",
            "La disponibilidad cambia rápido: un producto está asegurado recién cuando su pago se aprueba.",
          ]}
        />
      </Section>

      <Section title={t("Precios y pagos")}>
        <Bullets
          items={[
            "Los precios están en pesos chilenos e incluyen los impuestos que correspondan. El despacho se suma aparte y lo ves antes de pagar.",
            "Las ofertas relámpago valen solo hasta la hora que indica el contador.",
            "Pagas con Mercado Pago (tarjetas, débito y otros medios que ofrezca). Al iniciar el pago apartamos las unidades por unos minutos; si el pago no se completa, se liberan.",
            "Si por un error evidente un precio se publicó mal, te avisaremos y podrás elegir entre pagar el precio correcto o recibir la devolución completa.",
          ]}
        />
      </Section>

      <Section title={t("Entrega y retiro")}>
        <p>
          Despachamos a las comunas publicadas o puedes retirar sin costo. Los plazos y condiciones están en{" "}
          <Link href="/envios">Envíos y retiro</Link>. Al recibir, revisa el producto: la firma de recepción no te quita el derecho a
          reclamar después por fallas no informadas.
        </p>
      </Section>

      <Section title={t("Cambios, devoluciones y garantía")}>
        <p>
          Tienes {brand.legal.returnDays} días para arrepentirte de tu compra y te respondemos si el producto llega con una falla no
          informada. Todo el detalle está en <Link href="/devoluciones">Cambios y devoluciones</Link>.
        </p>
      </Section>

      {marketplace && (
        <Section title={t("Tiendas asociadas")}>
          <p>
            Algunos productos los publican y despachan tiendas asociadas. {brand.name} cobra el pago y lo retiene hasta que confirmas la
            recepción o pasa el plazo de revisión sin reclamos. Si hay un problema, nosotros mediamos y, si corresponde, te devolvemos el
            dinero.
          </p>
        </Section>
      )}

      <Section title={t("Tu cuenta")}>
        <p>
          Puedes comprar sin crear cuenta. Si creas una, eres responsable de cuidar tu contraseña. Podemos suspender cuentas usadas para
          fraudes o abusos.
        </p>
      </Section>

      <Section title={t("Datos personales")}>
        <p>
          Tratamos tus datos según nuestra <Link href="/privacidad">Política de privacidad</Link>.
        </p>
      </Section>

      <Section title={t("Ley aplicable")}>
        <p>
          Estos términos se rigen por la ley chilena, en especial la Ley 19.496 sobre Protección de los Derechos de los Consumidores.
          Nada de lo aquí dicho limita los derechos que esa ley te da. Puedes acudir al{" "}
          <a href="https://www.sernac.cl" target="_blank" rel="noopener noreferrer">SERNAC</a> o a los tribunales competentes.
        </p>
      </Section>
    </InfoPage>
  );
}
