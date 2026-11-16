/** Datos estructurados (schema.org) para que Google entienda la página. */
export function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      // Se escapa "<" para que ningún texto pueda cerrar la etiqueta
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
