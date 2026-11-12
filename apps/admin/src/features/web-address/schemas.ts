import { z } from "zod";

/**
 * A club's or an event's web address (its slug), changed by an admin when
 * the club asks (feature-register/mail-and-slugs-contract.md, Part S). The
 * old slugs keep working for good, as aliases that redirect to the new one:
 * printed QR codes, shared links, a club's site at {slug}.myotherapp.in.
 */

export type SlugKind = "club" | "event";

/** The public site. */
export const SITE = "https://myotherapp.in";
export const SITE_HOST = "myotherapp.in";

/** Where the public page lives: /clubs/{slug} or /events/{slug}. */
export function publicPath(kind: SlugKind, slug: string): string {
  return `/${kind === "club" ? "clubs" : "events"}/${slug}`;
}

export function publicUrl(kind: SlugKind, slug: string): string {
  return `${SITE}${publicPath(kind, slug)}`;
}

/** A club's own site, at its subdomain. */
export function clubSiteUrl(slug: string): string {
  return `https://${slug}.${SITE_HOST}`;
}

/** The old slugs an admin GET lists (`slug_aliases`): none from a server before them. */
export const slugAliasesField = z.array(z.string()).catch([]).default([]);

/** PATCH /admin/{clubs|events}/{id}/slug answers the new slug, the old ones that redirect to it (newest first), its public page and a club's site. */
export const slugChangeSchema = z.object({
  slug: z.string(),
  aliases: z.array(z.string()).catch([]).default([]),
  url: z.string().nullish().default(null).catch(null),
  site_url: z.string().nullish().default(null).catch(null),
});
export type SlugChange = z.infer<typeof slugChangeSchema>;

/**
 * Names that are the platform's, never a club's: the club-sites Worker's
 * (infra/cloudflare/club-sites/routing.js RESERVED) and the fallback
 * origin, `sites`.
 * Only a hint before asking; the server holds the list.
 */
export const RESERVED_CLUB_SLUGS = new Set([
  "www", "api", "admin", "admin-next", "club", "clubs", "clubs-next", "event", "events", "r",
  "mail", "email", "send", "rsend", "smtp", "imap", "pop", "mx", "app", "apps", "staging",
  "api-staging", "dev", "status", "help", "support", "docs", "blog", "static", "cdn", "assets",
  "m", "go", "link", "links", "auth", "login", "account", "accounts", "dashboard", "media",
  "sites",
]);

const SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** The rules the server holds, said before asking: 3 to 60 of a-z, 0-9 and inner hyphens, never two in a row. */
export function slugProblem(kind: SlugKind, value: string): string | null {
  const s = value.trim().toLowerCase();
  if (!s) return null;
  if (s.length < 3 || s.length > 60) return "A web address is 3 to 60 characters.";
  if (!SLUG.test(s)) return "Use lower-case letters, numbers and hyphens, starting and ending with a letter or a number.";
  if (s.includes("--")) return "No two hyphens in a row.";
  if (/^\d+$/.test(s)) return "A web address can't be only numbers: add a letter.";
  if (kind === "club" && RESERVED_CLUB_SLUGS.has(s)) return "That address is kept for the platform. Pick another.";
  return null;
}

/** What each refusal means, when the server gave no sentence of its own. */
export const SLUG_ERROR_TEXT: Record<string, string> = {
  SLUG_TAKEN: "That address is taken. Pick another.",
  SLUG_INVALID: "Use 3 to 60 lower-case letters, numbers and hyphens, starting and ending with a letter or a number, never two hyphens in a row.",
  SLUG_RESERVED: "That address is kept for the platform. Pick another.",
  CLUB_NOT_FOUND: "That club isn't there any more.",
  EVENT_NOT_FOUND: "That event isn't there any more.",
  INSUFFICIENT_ADMIN_ROLE: "Changing a web address is for owners and support.",
};
