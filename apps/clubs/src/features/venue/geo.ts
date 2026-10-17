/**
 * Points on the map, and the few ways a club gives us one.
 *
 * Pure, so the picker, both forms and their tests share one reading of
 * "12.97, 77.59" and of a pasted Google Maps link.
 */

/** Latitude then longitude, in degrees. */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Where a saved point came from, as the event and club detail payloads
 * report it: read off the map link, found from the venue's name, or set by
 * the club. A point the club set wins over the other two on the server.
 */
export const GEO_SOURCES = ["link", "geocoded", "manual"] as const;
export type GeoSource = (typeof GEO_SOURCES)[number];

const SOURCE_LABELS: Record<GeoSource, string> = {
  link: "From your map link",
  geocoded: "Found from the venue name",
  manual: "Set by you",
};

/** Where the pin came from, in the club's words; null when nobody said. */
export function sourceLabel(source: GeoSource | null | undefined): string | null {
  return source ? SOURCE_LABELS[source] : null;
}

export const isLat = (n: number) => Number.isFinite(n) && n >= -90 && n <= 90;
export const isLng = (n: number) => Number.isFinite(n) && n >= -180 && n <= 180;

/** Six decimals is about ten centimetres: more than a venue needs, and short on the wire. */
export function roundPoint(p: GeoPoint): GeoPoint {
  const r = (n: number) => Math.round(n * 1e6) / 1e6;
  return { lat: r(p.lat), lng: r(p.lng) };
}

const pointOf = (lat: string | undefined, lng: string | undefined): GeoPoint | null => {
  const a = Number(lat);
  const b = Number(lng);
  return lat && lng && isLat(a) && isLng(b) ? roundPoint({ lat: a, lng: b }) : null;
};

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
const COORDINATES = new RegExp(String.raw`^${NUM}\s*°?\s*(?:[,;]\s*|\s+)${NUM}\s*°?$`);

/**
 * "12.97160, 77.59460" as Google Maps copies it (or with a space or a
 * semicolon between) into a point. Latitude comes first; anything out of
 * range, or that is not two numbers, is null.
 */
export function parseCoordinates(text: string): GeoPoint | null {
  const m = text.trim().match(COORDINATES);
  return m ? pointOf(m[1], m[2]) : null;
}

/**
 * The point a full Google Maps link carries, when it carries one. A place
 * link names the pin itself (!3d…!4d…) as well as where the view was (@…),
 * and the pin is the venue, so it comes first. Short links
 * (maps.app.goo.gl) carry nothing until followed; the server does that.
 */
export function pointFromMapLink(link: string): GeoPoint | null {
  let text = link.trim();
  if (!text) return null;
  try {
    text = decodeURIComponent(text.replace(/\+/g, " "));
  } catch {
    // A stray % leaves the link as pasted; the patterns still apply.
  }
  const patterns = [
    new RegExp(String.raw`!3d${NUM}!4d${NUM}`),
    new RegExp(String.raw`[?&](?:q|query|ll|center|destination|daddr)=(?:loc:)?\s*${NUM}\s*,\s*${NUM}`),
    new RegExp(String.raw`@${NUM},${NUM}`),
    new RegExp(String.raw`^geo:${NUM},${NUM}`),
  ];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    const point = m ? pointOf(m[1], m[2]) : null;
    if (point) return point;
  }
  return null;
}

/** "12.97160, 77.59460": the form Google Maps uses, so it can be pasted back. */
export function formatPoint(p: GeoPoint): string {
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
}

/** Google's keyless embed, centred on the pin. */
export function mapEmbedUrl(p: GeoPoint): string {
  return `https://www.google.com/maps?q=${p.lat},${p.lng}&z=16&output=embed`;
}
