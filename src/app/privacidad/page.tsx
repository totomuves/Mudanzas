import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/brand";
import { Bullets, InfoPage, Section } from "@/components/info/InfoPage";
import { getContact } from "@/lib/contact";
import { getCookieConsentRequired } from "@/lib/site-settings";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: `Qué datos personales usa ${brand.name}, para qué, con quién se comparten y cómo ejercer tus derechos.`,
  alternates: { canonical: "/privacidad" },
};

export default async function PrivacidadPage() {
  const [c, consentRequired] = await Promise.all([getContact(), getCookieConsentRequired()]);
  const mail = <a href={`mailto:${c.email}`}>{c.email}</a>;

  return (
    <InfoPage
      current="/privacidad"
      eyebrow="Legal"
      title="Política de privacidad"
      intro="Usamos tus datos solo para venderte, entregarte y mostrarte cosas que te gusten. Nunca vendemos tu información."
      highlights={[
        { icon: "lock", title: "No guardamos tu tarjeta", text: "Los pagos los procesa Mercado Pago." },
        { icon: "sparkle", title: "Recomendaciones", text: "Lo que te gusta sirve para mostrarte productos para ti." },
        { icon: "user", title: "Tus datos, tu decisión", text: `Pide verlos, corregirlos o borrarlos en ${c.email}.` },
      ]}
    >
      <Section title="1. Quién es responsable">
        <p>
          {c.owner}
          {c.rut ? `, RUT ${c.rut}` : ""}
          {c.address ? `, con domicilio en ${c.address}, ${c.city}` : ""}, es responsable de los datos personales que se tratan en{" "}
          {brand.name}. Puedes escribirnos por cualquier tema de privacidad a {mail}.
        </p>
      </Section>

      <Section title="2. Qué datos usamos">
        <Bullets
          items={[
            <>
              <b>Cuenta:</b> correo y contraseña (si creas una). También puedes navegar sin cuenta: te asignamos un identificador anónimo.
            </>,
            <>
              <b>Compras:</b> nombre, correo, teléfono, dirección, comuna e indicaciones de entrega, productos comprados y montos.
            </>,
            <>
              <b>Entregas:</b> nombre de quien recibe, firma y foto de la entrega, como comprobante.
            </>,
            <>
              <b>Tus gustos:</b> categorías que eliges, productos que te gustan o descartas, búsquedas y productos que ves. Con eso
              ordenamos lo que te mostramos.
            </>,
            <>
              <b>Avisos:</b> si los activas, el permiso de notificaciones de tu navegador o teléfono.
            </>,
            <>
              <b>Uso del sitio:</b> páginas visitadas, dispositivo, navegador y datos aproximados de ubicación, mediante cookies y
              herramientas de medición (ver punto 5).
            </>,
          ]}
        />
        <p>No recibimos ni guardamos los datos de tu tarjeta o cuenta bancaria: los ingresas directamente en Mercado Pago.</p>
      </Section>

      <Section title="3. Para qué los usamos">
        <Bullets
          items={[
            "Procesar tu compra, coordinar la entrega o el retiro y darte el comprobante.",
            "Atender consultas, cambios, devoluciones y reembolsos.",
            "Recomendarte productos según tus gustos y avisarte de novedades si activaste los avisos.",
            "Medir cómo se usa el sitio y cómo funcionan nuestros anuncios, para mejorarlos.",
            "Prevenir fraudes y cumplir obligaciones legales y tributarias.",
          ]}
        />
        <p>
          La base es la ejecución de tu compra, tu consentimiento (gustos, avisos y medición), nuestro interés legítimo en prevenir
          fraudes, y el cumplimiento de la ley.
        </p>
      </Section>

      <Section title="4. Con quién los compartimos">
        <p>Solo con proveedores que necesitamos para operar, que tratan los datos por encargo nuestro:</p>
        <Bullets
          items={[
            <>
              <b>Mercado Pago</b>: pagos y reembolsos.
            </>,
            <>
              <b>Supabase</b> y <b>Vercel</b>: base de datos y servidores del sitio (pueden estar fuera de Chile).
            </>,
            <>
              <b>Google</b>, <b>Meta</b> (Facebook e Instagram) y <b>TikTok</b>: medición de visitas y anuncios (ver punto 5).
            </>,
            "Tiendas asociadas: si compras un producto de otra tienda, recibe tu nombre, teléfono y dirección para entregártelo.",
            "Autoridades, cuando la ley lo exige.",
          ]}
        />
        <p>No vendemos ni arrendamos tus datos personales.</p>
      </Section>

      <Section title="5. Cookies y medición" id="cookies">
        <p>
          Usamos cookies necesarias para que funcionen la sesión y el carrito. Esas no se pueden desactivar porque sin ellas el sitio
          no funciona.
        </p>
        {consentRequired ? (
          <>
            <p>
              Solo si lo aceptas en el aviso de cookies, usamos además Google Analytics, el píxel de Meta y el píxel de TikTok para
              saber qué productos se ven y se compran, y para mostrar anuncios de {brand.name} a quien le pueden interesar. Estas
              herramientas no reciben tu nombre, correo ni dirección. Si las rechazas, no se cargan y el sitio funciona igual.
            </p>
            <p>
              Tu elección se guarda en este navegador por 6 meses. Puedes cambiarla cuando quieras en{" "}
              <b>Preferencias de cookies</b>, al final de cada página. También puedes borrar las cookies desde tu navegador y
              ajustar los anuncios en tus cuentas de{" "}
              <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">Google</a>,{" "}
              <a href="https://www.facebook.com/adpreferences" target="_blank" rel="noopener noreferrer">Meta</a> y TikTok.
            </p>
          </>
        ) : (
          <>
            <p>
              Además usamos Google Analytics, el píxel de Meta y el píxel de TikTok para saber qué productos se ven y se compran, y
              para mostrar anuncios de {brand.name} a quien le pueden interesar. Estas herramientas no reciben tu nombre, correo ni
              dirección.
            </p>
            <p>
              Puedes bloquear o borrar las cookies desde tu navegador, y ajustar los anuncios en tus cuentas de{" "}
              <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">Google</a>,{" "}
              <a href="https://www.facebook.com/adpreferences" target="_blank" rel="noopener noreferrer">Meta</a> y TikTok.
            </p>
          </>
        )}
      </Section>

      <Section title="6. Cuánto tiempo los guardamos">
        <p>
          Los datos de compras los guardamos mientras lo exija la ley tributaria (hasta 6 años). Tus gustos y tu cuenta, hasta que nos
          pidas borrarlos. Las fotos y firmas de entrega, mientras puedan servir para resolver un reclamo.
        </p>
      </Section>

      <Section title="7. Tus derechos">
        <p>
          Según la Ley 19.628 sobre protección de la vida privada (y la Ley 21.719 cuando entre en vigencia), puedes pedir{" "}
          <b>acceso</b> a tus datos, su <b>rectificación</b>, <b>supresión</b>, <b>oposición</b> a ciertos usos y{" "}
          <b>portabilidad</b>, y retirar tu consentimiento cuando quieras. Escríbenos a {mail} desde el correo de tu cuenta o compra.
          Respondemos dentro de 15 días hábiles.
        </p>
        <p>
          Puedes ajustar tus gustos en <Link href="/mis-gustos">Mis gustos</Link> y desactivar los avisos en{" "}
          <Link href="/avisos">Avisos</Link>.
        </p>
      </Section>

      <Section title="8. Seguridad y menores">
        <p>
          Protegemos los datos con conexión cifrada, acceso restringido para el equipo y reglas de acceso en la base de datos. El sitio
          no está dirigido a menores de 18 años y no les pedimos datos intencionalmente.
        </p>
      </Section>

      <Section title="9. Cambios a esta política">
        <p>Si cambiamos algo importante, lo publicaremos aquí con la nueva fecha y, si corresponde, te avisaremos por correo.</p>
      </Section>
    </InfoPage>
  );
}
