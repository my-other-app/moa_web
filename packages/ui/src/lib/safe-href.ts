/**
 * A link someone typed (a club's or a speaker's website, a social handle
 * turned into a URL, a partner's page, a submission) as an href: an
 * absolute http(s) or mailto address, or a path on this site. Anything else
 * (another scheme, a `//host` address, text that is not a URL) is no link
 * at all, so the caller shows it as plain text.
 */
export function safeHref(raw: string | null | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim();
  if (!v) return undefined;
  // A path on this site, but not a protocol-relative address (//host or /\host).
  if (v.startsWith("/")) return /^\/[/\\]/.test(v) ? undefined : v;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return undefined;
  }
  return u.protocol === "https:" || u.protocol === "http:" || u.protocol === "mailto:" ? v : undefined;
}
