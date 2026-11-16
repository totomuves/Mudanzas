import Image from "next/image";

export type GalleryPhoto = { id: string; image_url: string; title: string | null; caption: string | null };

/** Galería de fotos de una página (se llena desde /admin/paginas). La primera foto sale más grande. */
export function PhotoGallery({ photos, eyebrow, title }: { photos: GalleryPhoto[]; eyebrow: string; title: string }) {
  if (photos.length === 0) return null;
  return (
    <section className="space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted">{eyebrow}</p>
        <h2 className="text-2xl font-black">{title}</h2>
      </div>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {photos.map((w, i) => (
          <li key={w.id} className={i === 0 && photos.length > 2 ? "col-span-2 row-span-2" : ""}>
            <figure className="group relative h-full min-h-40 overflow-hidden rounded-card bg-surface">
              <Image
                src={w.image_url}
                alt={w.title ?? title}
                fill
                sizes="(max-width: 768px) 50vw, 33vw"
                className="object-cover transition duration-500 group-hover:scale-[1.03]"
              />
              {(w.title || w.caption) && (
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-10 text-white">
                  {w.title && <p className="text-sm font-extrabold">{w.title}</p>}
                  {w.caption && <p className="text-xs text-white/85">{w.caption}</p>}
                </figcaption>
              )}
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
