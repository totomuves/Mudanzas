/**
 * Reseñas de Google sincronizadas solas (Google Places API, versión nueva).
 *
 * - Con GOOGLE_MAPS_API_KEY (la misma de las rutas) y "Places API (New)" activada en Google Cloud,
 *   trae la nota, el total de reseñas y las últimas reseñas de la ficha. Se refresca cada 6 horas.
 * - Google entrega como máximo 5 reseñas por ficha. Por eso se muestran primero esas
 *   y después las copiadas a mano en src/lib/conocenos.ts (sin repetir nombres).
 * - Sin clave, o si Google falla, se muestran solo las copiadas a mano.
 *
 * Para elegir la ficha exacta se puede poner GOOGLE_PLACE_ID en Vercel. Si no está,
 * se busca una vez por nombre (GOOGLE_PLACE_QUERY, por defecto "Totomoves Santiago").
 */
import "server-only";
import { GOOGLE_RATING, GOOGLE_REVIEWS_URL, REVIEWS } from "@/lib/conocenos";

export type Review = { name: string; text: string; rating: number; when?: string; photo?: string; url?: string };
export type ReviewsData = {
  rating: string; // "5,0"
  count: number | null; // total en Google
  url: string; // ficha de Google
  reviews: Review[];
  synced: boolean; // true si vienen de Google
};

const SIX_HOURS = 6 * 60 * 60;
const WEEK = 7 * 24 * 60 * 60;

type PlaceReview = {
  rating?: number;
  text?: { text?: string };
  originalText?: { text?: string };
  authorAttribution?: { displayName?: string; photoUri?: string; uri?: string };
  relativePublishTimeDescription?: string;
};

function manual(): ReviewsData {
  return {
    rating: GOOGLE_RATING,
    count: null,
    url: GOOGLE_REVIEWS_URL,
    reviews: REVIEWS.map((r) => ({ ...r, rating: 5 })),
    synced: false,
  };
}

async function findPlaceId(key: string): Promise<string | null> {
  const fixed = process.env.GOOGLE_PLACE_ID?.trim();
  if (fixed) return fixed;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id" },
    body: JSON.stringify({ textQuery: process.env.GOOGLE_PLACE_QUERY?.trim() || "Totomoves Santiago", languageCode: "es", regionCode: "CL" }),
    next: { revalidate: WEEK },
  });
  if (!res.ok) throw new Error(`searchText ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { places?: { id: string }[] };
  return data.places?.[0]?.id ?? null;
}

export async function getReviews(): Promise<ReviewsData> {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) return manual();
  try {
    const placeId = await findPlaceId(key);
    if (!placeId) return manual();
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=es&regionCode=CL`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "rating,userRatingCount,reviews,googleMapsUri" },
      next: { revalidate: SIX_HOURS },
    });
    if (!res.ok) throw new Error(`place ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const place = (await res.json()) as { rating?: number; userRatingCount?: number; reviews?: PlaceReview[]; googleMapsUri?: string };

    const fromGoogle: Review[] = (place.reviews ?? [])
      .filter((r) => (r.rating ?? 0) >= 4)
      .map((r) => ({
        name: r.authorAttribution?.displayName?.trim() || "Cliente en Google",
        text: (r.originalText?.text || r.text?.text || "").trim(),
        rating: r.rating ?? 5,
        when: r.relativePublishTimeDescription,
        photo: r.authorAttribution?.photoUri,
        url: r.authorAttribution?.uri,
      }))
      .filter((r) => r.text.length > 0);

    const seen = new Set(fromGoogle.map((r) => r.name.toLowerCase()));
    const rest = REVIEWS.filter((r) => !seen.has(r.name.toLowerCase())).map((r) => ({ ...r, rating: 5 }));

    return {
      rating: place.rating ? place.rating.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : GOOGLE_RATING,
      count: place.userRatingCount ?? null,
      url: place.googleMapsUri || GOOGLE_REVIEWS_URL,
      reviews: [...fromGoogle, ...rest],
      synced: true,
    };
  } catch (e) {
    console.error("[google reviews]", e);
    return manual();
  }
}
