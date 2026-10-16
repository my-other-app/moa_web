/**
 * The public site: where guests read an event or a club.
 *
 * One place for its address, so no screen hands out a link to a host the
 * site has left. It moved off the events subdomain to the apex in
 * 2026-10, and event pages from `/{id}` to `/events/{slug}`.
 */
export const PUBLIC_SITE = "https://myotherapp.in";

/** The site's address without the scheme, for showing rather than linking. */
export const PUBLIC_SITE_HOST = new URL(PUBLIC_SITE).host;

/** An event's public page. */
export const eventPublicUrl = (slug: string) =>
  `${PUBLIC_SITE}/events/${encodeURIComponent(slug)}`;

/** A club's public page. */
export const clubPublicUrl = (slug: string) =>
  `${PUBLIC_SITE}/clubs/${encodeURIComponent(slug)}`;
