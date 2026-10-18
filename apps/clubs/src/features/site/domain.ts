import { z } from "zod";
import { ApiError } from "@moa/api";

import { isPlanLockError } from "@/features/plan/errors";

/**
 * A domain of the club's own for its website (GET /clubs/site/domain).
 *
 * The site always lives at `default_host` ({slug}.myotherapp.in). A club on
 * a plan with `custom_domain` can put it at www.theirclub.org as well: it
 * adds the DNS records we hand over, we check them until they resolve, and
 * from then on the default address forwards to the club's own.
 *
 * pending  waiting for the records to show up in DNS
 * active   the site answers at the club's domain, with a certificate
 * failed   the check gave up; `last_error` says why
 * paused   the plan lost the feature: visitors go to the default address
 *          until the club upgrades (or 30 days pass and it is removed)
 * removed  taken off; treated as no domain
 */
export const DOMAIN_STATUSES = ["pending", "active", "failed", "paused", "removed"] as const;
export type DomainStatus = (typeof DOMAIN_STATUSES)[number];

export const dnsRecordSchema = z.object({
  type: z.string(),
  name: z.string(),
  value: z.string(),
  /** route: points the name at us; ownership: proves the domain is the club's; ssl: lets the certificate be issued. */
  purpose: z.string().catch("route"),
});
export type DnsRecord = z.infer<typeof dnsRecordSchema>;

export const customDomainSchema = z.object({
  host: z.string(),
  /* Kept as the server says it: a status this build does not know still shows. */
  status: z.string(),
  records: z.array(dnsRecordSchema).catch([]),
  ssl_status: z.string().nullish(),
  last_error: z.string().nullish(),
  verified_at: z.string().nullish(),
  created_at: z.string().nullish(),
});
export type CustomDomain = z.infer<typeof customDomainSchema>;

export const siteDomainSchema = z.object({
  /** False: the platform is not set up for custom domains yet. */
  available: z.boolean(),
  /** The club's plan includes `custom_domain`. */
  entitled: z.boolean(),
  default_host: z.string(),
  domain: customDomainSchema.nullable(),
});
export type SiteDomain = z.infer<typeof siteDomainSchema>;

/** What a server from before custom domains (a bare 404 on the route) amounts to: none to be had. */
export const NOT_ON_THIS_SERVER: SiteDomain = { available: false, entitled: false, default_host: "", domain: null };

/** The domain the card shows, or null when there is none to show (never set, or removed). */
export function currentDomain(d: SiteDomain | undefined): CustomDomain | null {
  const domain = d?.domain ?? null;
  return domain && domain.status !== "removed" ? domain : null;
}

// ─── Polling ──────────────────────────────────────────────────────────────

/** How often a pending domain is read again while its page is open. */
export const DOMAIN_POLL_MS = 30_000;

/** React Query's `refetchInterval`: every 30 s while pending, not at all otherwise. */
export function domainPollInterval(d: SiteDomain | undefined): number | false {
  return d?.domain?.status === "pending" ? DOMAIN_POLL_MS : false;
}

// ─── The host the club types ──────────────────────────────────────────────

/**
 * What the club typed, as the host it means: "https://WWW.TheirClub.org/about"
 * is www.theirclub.org. Drops the scheme, any user, port, path, query and
 * trailing dot; lower-cases; turns an international name into its xn-- form
 * (as DNS and the server see it).
 */
export function normaliseHost(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^\/\//, "");
  s = s.split(/[/?#\s]/)[0] ?? "";
  s = s.replace(/^[^@]*@/, "");
  s = s.replace(/:\d*$/, "");
  s = s.replace(/^\.+/, "").replace(/\.+$/, "");
  if (/[^\u0020-\u007e]/.test(s)) {
    try {
      s = new URL(`http://${s}`).hostname;
    } catch {
      // Left as typed: hostProblem says what is wrong with it.
    }
  }
  return s;
}

/** One dot-separated part: up to 63 letters, digits and hyphens, not starting or ending with a hyphen. */
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Why a normalised host cannot be a domain, before the server is asked; null
 * when it could be. Whether it is a bare domain (theirclub.org) is the
 * server's call: only it knows where each registry draws the line.
 */
export function hostProblem(host: string): string | null {
  if (!host) return null;
  if (!/^[a-z0-9.-]+$/.test(host)) return "Use only letters, numbers, dots and hyphens.";
  const labels = host.split(".");
  if (labels.length < 2) return "Add the ending too, like .org or .in.";
  if (labels.some((l) => l.length === 0)) return "There are two dots in a row.";
  if (host.length > 253 || !labels.every((l) => LABEL.test(l))) return "That isn't a valid domain name.";
  if (!/^(xn--[a-z0-9-]+|[a-z]{2,63})$/.test(labels.at(-1)!)) return "That ending isn't a domain ending.";
  if (host === "myotherapp.in" || host.endsWith(".myotherapp.in")) return "That's a MyOtherApp address. Use a domain you own.";
  return null;
}

// ─── The records ──────────────────────────────────────────────────────────

/** Second-level names registries sell under a country ending: theirclub.co.in, theirclub.org.uk. */
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "ac", "edu", "gov", "res", "gen", "firm", "ind", "ltd", "plc", "nic", "mil", "me"]);

/**
 * The domain a club bought, from a host on it: www.theirclub.org is on
 * theirclub.org, club.theirclub.co.in on theirclub.co.in. A best guess
 * (there is no list of every registry's rules here); it only words a tip.
 */
export function zoneOf(host: string): string {
  const labels = host.replace(/\.$/, "").split(".");
  const tld = labels.at(-1) ?? "";
  const sld = labels.at(-2) ?? "";
  const take = labels.length >= 3 && tld.length === 2 && SECOND_LEVEL.has(sld) ? 3 : 2;
  return labels.slice(-take).join(".");
}

/**
 * A record's name as GoDaddy, Hostinger and Namecheap want it: the part
 * before the club's domain ("www"), since they add the domain themselves.
 * Null when the name is the domain itself or not under it.
 */
export function shortName(name: string, zone: string): string | null {
  const n = name.replace(/\.$/, "").toLowerCase();
  const suffix = `.${zone.toLowerCase()}`;
  return n.endsWith(suffix) && n.length > suffix.length ? n.slice(0, -suffix.length) : null;
}

export const PURPOSE_LABEL: Record<string, string> = {
  route: "Points your domain at your site",
  ownership: "Proves the domain is yours",
  ssl: "Lets us issue the HTTPS certificate",
};

export function purposeLabel(purpose: string): string {
  return PURPOSE_LABEL[purpose] ?? purpose.replace(/_/g, " ");
}

// ─── Status words ─────────────────────────────────────────────────────────

export type Tone = "default" | "success" | "warning" | "destructive" | "info";

const STATUS_WORDS: Record<DomainStatus, { label: string; tone: Tone }> = {
  pending: { label: "Waiting for DNS", tone: "warning" },
  active: { label: "Live", tone: "success" },
  failed: { label: "Not connected", tone: "destructive" },
  paused: { label: "Paused", tone: "warning" },
  removed: { label: "Removed", tone: "default" },
};

export function domainStatus(status: string): { label: string; tone: Tone } {
  return (STATUS_WORDS as Record<string, { label: string; tone: Tone }>)[status] ?? { label: status.replace(/_/g, " "), tone: "default" };
}

/** The certificate's state (Cloudflare's words, through the server) in the club's. */
export function sslStatus(status: string | null | undefined): { label: string; tone: Tone } {
  const s = (status ?? "").toLowerCase();
  if (!s) return { label: "Not started", tone: "default" };
  if (s === "active") return { label: "Active · HTTPS on", tone: "success" };
  if (s === "initializing" || s === "pending" || s.startsWith("pending_")) return { label: "Being issued", tone: "warning" };
  if (s.includes("fail") || s.includes("timed_out") || s === "expired" || s === "deleted") return { label: `Problem · ${s.replace(/_/g, " ")}`, tone: "destructive" };
  return { label: s.replace(/_/g, " "), tone: "default" };
}

// ─── Refusals ─────────────────────────────────────────────────────────────

export const INVALID_HOST = "INVALID_HOST";
export const APEX_NOT_SUPPORTED = "APEX_NOT_SUPPORTED";
export const HOST_TAKEN = "HOST_TAKEN";
export const DOMAINS_UNAVAILABLE = "DOMAINS_UNAVAILABLE";
export const CLOUDFLARE_ERROR = "CLOUDFLARE_ERROR";

const FALLBACK: Record<string, string> = {
  [INVALID_HOST]: "That isn't a domain we can connect. Try something like www.yourclub.org.",
  [APEX_NOT_SUPPORTED]: "Use www or another subdomain rather than the bare domain.",
  [HOST_TAKEN]: "That domain is already connected to another site.",
  [DOMAINS_UNAVAILABLE]: "Custom domains aren't available right now. Try again later.",
  [CLOUDFLARE_ERROR]: "We couldn't reach our domain provider. Try again in a few minutes.",
};

/** A 403 that is not the plan's: a role that may read the domain but not change it (or not even read it). */
export function isRoleRefusal(error: unknown): boolean {
  return error instanceof ApiError && error.isForbidden && !isPlanLockError(error);
}

/**
 * What a refused connect says under the field: the server's words, and for a
 * bare domain the www. one to use instead. Null for a plan refusal, which the
 * upgrade dialog answers.
 */
export function connectProblem(error: unknown, host: string): { code: string | null; message: string; suggestion: string | null } | null {
  if (isPlanLockError(error)) return null;
  if (!(error instanceof ApiError)) return { code: null, message: "That did not go through. Try again.", suggestion: null };
  const code = error.errorCode;
  // A server message is better than ours; the status's stock words are not.
  const stock = !error.message || /^(Something went wrong|That request was not valid|Some of the submitted values)/.test(error.message);
  const message = (!stock && error.message) || (code && FALLBACK[code]) || error.message || "That did not go through. Try again.";
  const suggestion = code === APEX_NOT_SUPPORTED && host && !host.startsWith("www.") ? `www.${host}` : null;
  return { code, message, suggestion };
}
