import { isLat, isLng, pointFromMapLink, type GeoPoint, type GeoSource } from "./geo";

/**
 * The pin as the picker works with it.
 *
 * `clear` asks the server to forget a pin the club set by hand. It is how
 * "Remove pin" is said on the wire, and also how a pasted map link gets to
 * move a pin the club set earlier: on the server a hand-set pin wins over
 * the link, so it has to go first.
 */
export interface PinState {
  point: GeoPoint | null;
  source: GeoSource | null;
  clear: boolean;
}

/** The pin as the event and club forms hold it: flat, the way the server names it. */
export interface PinFields {
  lat?: number | null;
  lng?: number | null;
  geo_source?: GeoSource | null;
  clear_point?: boolean | null;
}

/** The same, as a form's values: every field set, nothing undefined. */
export interface PinValues {
  lat: number | null;
  lng: number | null;
  geo_source: GeoSource | null;
  clear_point: boolean;
}

export const NO_PIN: PinState = { point: null, source: null, clear: false };

/** A place picked from the search, or coordinates typed in: the club's own pin. */
export const pinAt = (point: GeoPoint): PinState => ({ point, source: "manual", clear: false });

/** "Remove pin": nothing on the map, and the server told to drop the one set by hand. */
export const removedPin = (): PinState => ({ point: null, source: null, clear: true });

/**
 * The map link was edited under "Adjust pin", so the pin follows it. When
 * the link names its point the preview moves there now; a short link is
 * only read by the server, so the pin waits for the save. Emptying the link
 * takes its pin with it and leaves any other pin alone.
 */
export function pinForLink(prev: PinState, link: string): PinState {
  if (!link.trim()) {
    return prev.source === "link" ? { point: null, source: null, clear: prev.clear } : prev;
  }
  return { point: pointFromMapLink(link), source: "link", clear: prev.clear || prev.source === "manual" };
}

export function pinOf(v: PinFields): PinState {
  const point = v.lat != null && v.lng != null ? { lat: v.lat, lng: v.lng } : null;
  return { point, source: v.geo_source ?? null, clear: Boolean(v.clear_point) };
}

export function pinFieldsOf(pin: PinState): PinValues {
  return { lat: pin.point?.lat ?? null, lng: pin.point?.lng ?? null, geo_source: pin.source, clear_point: pin.clear };
}

/**
 * A detail payload's pin, as form values. Half a point, or one out of
 * range, is no point; where it came from only counts when there is one.
 */
export function pinFromDetail(d: { lat?: number | null; lng?: number | null; geo_source?: GeoSource | null }): PinValues {
  const { lat, lng } = d;
  if (lat == null || lng == null || !isLat(lat) || !isLng(lng)) {
    return { lat: null, lng: null, geo_source: null, clear_point: false };
  }
  return { lat, lng, geo_source: d.geo_source ?? null, clear_point: false };
}

/**
 * What a save says about the pin, as multipart fields.
 *
 *   lat, lng      only for a pin the club set. One read from the map link
 *                 or found from the venue name is the server's to keep
 *                 deriving: sent back, it would be frozen as "set by you"
 *                 and stop following the link.
 *   clear_point   "true" when the club removed its pin, or let a pasted
 *                 link replace it; never alongside lat/lng.
 *
 * An online event has no venue, so no pin: it always sends clear_point.
 * Nothing at all is sent for a pin nobody touched.
 */
export function pinWireFields(v: PinFields, opts: { online?: boolean } = {}): Array<[string, string]> {
  if (opts.online) return [["clear_point", "true"]];
  if (v.geo_source === "manual" && v.lat != null && v.lng != null) {
    return [
      ["lat", String(v.lat)],
      ["lng", String(v.lng)],
    ];
  }
  if (v.clear_point) return [["clear_point", "true"]];
  return [];
}
