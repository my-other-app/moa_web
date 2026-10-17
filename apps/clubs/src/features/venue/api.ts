import { isLat, isLng, roundPoint, type GeoPoint } from "./geo";
import { photonFeatureSchema, photonResponseSchema, type PhotonFeature } from "./schemas";

/**
 * Photon: place search over OpenStreetMap. Free, keyless and open to
 * browsers, so the dashboard asks it directly rather than through the
 * gateway.
 */
export const PHOTON_ENDPOINT = "https://photon.komoot.io/api/";
export const PLACE_LIMIT = 6;
/** The middle of India: Indian places rank first, the rest stay findable. */
const BIAS = { lat: "20.59", lon: "78.96" };

/** One suggestion: a name to show and keep, the line under it, and the point. */
export interface Place {
  id: string;
  name: string;
  street: string | null;
  city: string | null;
  point: GeoPoint;
}

export function photonUrl(query: string): string {
  const params = new URLSearchParams({ q: query, limit: String(PLACE_LIMIT), lang: "en", lat: BIAS.lat, lon: BIAS.lon });
  return `${PHOTON_ENDPOINT}?${params.toString()}`;
}

const clean = (s: string | null | undefined) => s?.trim() || null;

function placeOf({ geometry, properties: p }: PhotonFeature, index: number): Place | null {
  const [lng, lat] = geometry.coordinates;
  if (!isLat(lat) || !isLng(lng)) return null;
  const road = [clean(p.housenumber), clean(p.street)].filter(Boolean).join(" ") || null;
  // An unnamed building is still findable by its address.
  const name = clean(p.name) ?? road;
  if (!name) return null;
  const city = clean(p.city) ?? clean(p.locality) ?? clean(p.district) ?? clean(p.county) ?? clean(p.state);
  return {
    id: p.osm_type && p.osm_id != null ? `${p.osm_type}${p.osm_id}` : `place-${index}`,
    name,
    street: road && road !== name ? road : null,
    city: city && city !== name ? city : null,
    point: roundPoint({ lat, lng }),
  };
}

/**
 * Photon's answer as suggestions. A feature that cannot be shown (no name,
 * no address, a point off the globe) is dropped, as is a repeat of one
 * already listed. A body that is not an answer at all throws, so the
 * picker treats it like any other failure.
 */
export function placesOf(raw: unknown): Place[] {
  const { features } = photonResponseSchema.parse(raw);
  const seen = new Set<string>();
  const places: Place[] = [];
  features.forEach((feature, index) => {
    const parsed = photonFeatureSchema.safeParse(feature);
    const place = parsed.success ? placeOf(parsed.data, index) : null;
    if (!place) return;
    const key = `${place.name}|${place.street ?? ""}|${place.city ?? ""}`.toLowerCase();
    if (seen.has(key) || seen.has(place.id)) return;
    seen.add(key);
    seen.add(place.id);
    places.push(place);
  });
  return places;
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const response = await fetch(photonUrl(query), { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Place search answered ${response.status}`);
  return placesOf(await response.json());
}
