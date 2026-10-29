/**
 * Where the room is, for the screen at the front of the hall.
 *
 * Everyone without the app joins in a browser: the event's public page has
 * a /live child (the event site's router), and the legacy `/{id}/live`
 * address still resolves there, so an event whose slug the console has not
 * read yet still gets a QR that works.
 */
import { PUBLIC_SITE, PUBLIC_SITE_HOST } from "@/lib/public-site";

export interface RoomEvent {
  id: number;
  slug?: string | null;
}

/** The address the join QR encodes. */
export function roomUrl({ id, slug }: RoomEvent): string {
  return slug
    ? `${PUBLIC_SITE}/events/${encodeURIComponent(slug)}/live`
    : `${PUBLIC_SITE}/${id}/live`;
}

/**
 * The same address as it is read out and typed in: no scheme, because
 * nobody types "https://" off a projector.
 */
export function roomAddress(event: RoomEvent): string {
  return `${PUBLIC_SITE_HOST}${new URL(roomUrl(event)).pathname}`;
}
