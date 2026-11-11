import { z } from "zod";

/**
 * Integrations, as the admin portal sees them
 * (feature-register/integrations-api-contract.md, "Dashboards"): which clubs
 * have API access and on what terms, the partner apps MyOtherApp lets in
 * (only an admin registers one), and how webhooks are faring across the
 * platform. Nothing is on by default: a club gets API access here.
 */

// ─── Scopes ──────────────────────────────────────────────────────────────

export const SCOPES = [
  "club:read",
  "club:write",
  "events:read",
  "events:write",
  "events:publish",
  "registrations:read",
  "registrations:write",
  "attendees:read",
  "checkins:write",
  "certificates:read",
  "certificates:write",
  "webhooks:manage",
  "clubs:create",
] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_LABEL: Record<Scope, string> = {
  "club:read": "See the club",
  "club:write": "Change the club's profile",
  "events:read": "See events",
  "events:write": "Create and edit events",
  "events:publish": "Publish events",
  "registrations:read": "See registrations",
  "registrations:write": "Register people",
  "attendees:read": "See people's details",
  "checkins:write": "Check people in",
  "certificates:read": "See certificates",
  "certificates:write": "Issue certificates",
  "webhooks:manage": "Manage webhooks",
  "clubs:create": "Create clubs",
};

export const SCOPE_HINT: Partial<Record<Scope, string>> = {
  "attendees:read": "Names, emails, phones and answers. Each club ticks that its form says so before granting it.",
  "clubs:create": "Partner apps only. A club it makes waits for approval like a self-signup, and its owner is invited by email.",
};

export const SCOPE_GROUPS: { label: string; scopes: Scope[] }[] = [
  { label: "The club", scopes: ["club:read", "club:write"] },
  { label: "Events", scopes: ["events:read", "events:write", "events:publish"] },
  { label: "Registrations and people", scopes: ["registrations:read", "registrations:write", "attendees:read"] },
  { label: "At the door", scopes: ["checkins:write"] },
  { label: "Certificates", scopes: ["certificates:read", "certificates:write"] },
  { label: "Webhooks", scopes: ["webhooks:manage"] },
  { label: "The platform", scopes: ["clubs:create"] },
];

export function scopeLabel(scope: string): string {
  return (SCOPE_LABEL as Record<string, string>)[scope] ?? scope;
}

/** In the catalogue's order, then any this build doesn't know. */
export function orderScopes(scopes: readonly string[]): string[] {
  const known = new Set<string>(SCOPES);
  return [...SCOPES.filter((s) => scopes.includes(s)), ...scopes.filter((s) => !known.has(s))];
}

// ─── Rate tiers ──────────────────────────────────────────────────────────

export const RATE_TIERS = ["standard", "high"] as const;
export type RateTier = (typeof RATE_TIERS)[number];

export const TIER_INFO: Record<RateTier, { label: string; read: number; write: number }> = {
  standard: { label: "Standard", read: 600, write: 120 },
  high: { label: "High", read: 3000, write: 600 },
};

export function tierLabel(tier: string): string {
  return (TIER_INFO as Record<string, { label: string }>)[tier]?.label ?? tier;
}

export const DEFAULT_MAX_KEYS = 5;

// ─── Clubs with API access ───────────────────────────────────────────────

const personSchema = z.object({ name: z.string().nullable().optional().catch(null), email: z.string().nullable().optional().catch(null) });

export const allocationSchema = z.object({
  club: z.object({ id: z.coerce.number(), name: z.string(), slug: z.string().nullable().optional().catch(null) }),
  allocated: z.boolean().catch(false),
  rate_tier: z.string().catch("standard"),
  max_keys: z.number().catch(DEFAULT_MAX_KEYS),
  notes: z.string().nullable().optional().catch(null),
  allocated_at: z.string().nullable().optional().catch(null),
  allocated_by: personSchema.nullable().optional().catch(null),
  /** When access was last taken away; null while it is on. */
  revoked_at: z.string().nullable().optional().catch(null),
  keys_active: z.number().catch(0),
  apps_connected: z.number().catch(0),
  endpoints: z.number().catch(0),
  requests_30d: z.number().catch(0),
  errors_30d: z.number().catch(0),
  last_used_at: z.string().nullable().optional().catch(null),
});
export type Allocation = z.infer<typeof allocationSchema>;

export const allocationPageSchema = z.object({ items: z.array(allocationSchema), total: z.number().catch(0) });

export interface AllocationBody {
  allocated: boolean;
  rate_tier: RateTier;
  max_keys: number;
  notes: string | null;
}

export interface AllocationForm {
  tier: RateTier;
  maxKeys: string;
  notes: string;
}

export function allocationProblems(f: AllocationForm): Partial<Record<"maxKeys" | "notes", string>> {
  const out: Partial<Record<"maxKeys" | "notes", string>> = {};
  const n = Number(f.maxKeys);
  if (!/^\d+$/.test(f.maxKeys.trim()) || n < 1 || n > 50) out.maxKeys = "A whole number from 1 to 50.";
  if (f.notes.length > 1000) out.notes = "Keep notes to 1,000 characters.";
  return out;
}

export const ACCESS_FILTERS = [
  { value: "allocated", label: "On" },
  { value: "revoked", label: "Taken away" },
] as const;

// ─── Partner apps ────────────────────────────────────────────────────────

export const partnerAppSchema = z.object({
  id: z.coerce.string(),
  name: z.string(),
  client_id: z.string(),
  logo_url: z.string().nullable().optional().catch(null),
  website: z.string().nullable().optional().catch(null),
  redirect_uris: z.array(z.string()).catch([]),
  allowed_scopes: z.array(z.string()).catch([]),
  /** "active" or "suspended"; kept as the server says it. */
  status: z.string().catch("active"),
  created_at: z.string().nullable().optional().catch(null),
  suspended_at: z.string().nullable().optional().catch(null),
  clubs_connected: z.number().catch(0),
  last_used_at: z.string().nullable().optional().catch(null),
});
export type PartnerApp = z.infer<typeof partnerAppSchema>;

export const partnerAppPageSchema = z.object({ items: z.array(partnerAppSchema), total: z.number().catch(0) });

/** A new app, or one whose secret was replaced: the secret, which the server never shows again. */
export const partnerAppWithSecretSchema = z.object({ app: partnerAppSchema, client_secret: z.string().min(1) });
export type PartnerAppWithSecret = z.infer<typeof partnerAppWithSecretSchema>;

export const partnerClubSchema = z.object({
  club: z.object({ id: z.coerce.number(), name: z.string(), slug: z.string().nullable().optional().catch(null) }),
  scopes: z.array(z.string()).catch([]),
  connected_at: z.string().nullable().optional().catch(null),
  connected_by: personSchema.nullable().optional().catch(null),
  last_used_at: z.string().nullable().optional().catch(null),
});
export type PartnerClub = z.infer<typeof partnerClubSchema>;

export const partnerClubsSchema = z.object({ items: z.array(partnerClubSchema).catch([]) });

export interface PartnerAppBody {
  name: string;
  logo_url: string | null;
  website: string | null;
  redirect_uris: string[];
  allowed_scopes: string[];
}

export interface PartnerAppForm {
  name: string;
  logoUrl: string;
  website: string;
  redirects: string;
  scopes: string[];
}

export const EMPTY_PARTNER_FORM: PartnerAppForm = { name: "", logoUrl: "", website: "", redirects: "", scopes: [] };

export function partnerFormFrom(app: PartnerApp): PartnerAppForm {
  return { name: app.name, logoUrl: app.logo_url ?? "", website: app.website ?? "", redirects: app.redirect_uris.join("\n"), scopes: app.allowed_scopes };
}

function httpsUrl(text: string): boolean {
  try {
    return new URL(text).protocol === "https:";
  } catch {
    return false;
  }
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * A redirect URI OAuth 2.1 allows: https, http on this computer only (a
 * developer's), or a native app's own scheme (com.example.app:/callback).
 * Never a fragment, never script.
 */
export function redirectProblem(uri: string): string | null {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return `${uri} isn't an address`;
  }
  if (url.hash) return `${uri} mustn't have a # part`;
  if (url.protocol === "https:") return null;
  if (url.protocol === "http:") return LOOPBACK.has(url.hostname) ? null : `${uri} must use https (http only for localhost)`;
  if (/^(javascript|data|vbscript|file|ftp):$/i.test(url.protocol)) return `${uri} can't be a redirect`;
  return /^[a-z][a-z0-9+.-]*\.[a-z0-9+.-]+:$/i.test(url.protocol) ? null : `${uri}: an app's own scheme looks like com.example.app:/callback`;
}

export function splitLines(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
}

export function partnerProblems(f: PartnerAppForm): Partial<Record<"name" | "logoUrl" | "website" | "redirects" | "scopes", string>> {
  const out: Partial<Record<"name" | "logoUrl" | "website" | "redirects" | "scopes", string>> = {};
  if (!f.name.trim()) out.name = "Give the app its name, as clubs will see it.";
  else if (f.name.trim().length > 80) out.name = "Keep the name to 80 characters.";
  if (f.logoUrl.trim() && !httpsUrl(f.logoUrl.trim())) out.logoUrl = "An https address of the logo.";
  if (f.website.trim() && !httpsUrl(f.website.trim())) out.website = "An https address.";
  const uris = splitLines(f.redirects);
  if (uris.length === 0) out.redirects = "At least one address to send people back to after they allow it.";
  else {
    const bad = uris.map(redirectProblem).filter((p): p is string => p !== null);
    if (bad.length) out.redirects = bad.join("; ");
  }
  if (f.scopes.length === 0) out.scopes = "Choose at least one thing it may ask clubs for.";
  return out;
}

export function partnerBody(f: PartnerAppForm): PartnerAppBody {
  return {
    name: f.name.trim(),
    logo_url: f.logoUrl.trim() || null,
    website: f.website.trim() || null,
    redirect_uris: splitLines(f.redirects),
    allowed_scopes: orderScopes(f.scopes),
  };
}

export function isSuspended(app: Pick<PartnerApp, "status">): boolean {
  return app.status === "suspended";
}

// ─── Usage and webhook health ────────────────────────────────────────────

export const usageSchema = z.object({ days: z.array(z.object({ date: z.string(), requests: z.number().catch(0), errors: z.number().catch(0) })).catch([]) });
export type Usage = z.infer<typeof usageSchema>;

export const failingEndpointSchema = z.object({
  endpoint_id: z.coerce.string(),
  url: z.string(),
  club: z.object({ id: z.coerce.number(), name: z.string() }).nullable().optional().catch(null),
  partner_app: z.object({ id: z.coerce.string(), name: z.string() }).nullable().optional().catch(null),
  enabled: z.boolean().catch(true),
  failing_since: z.string().nullable().optional().catch(null),
  consecutive_failures: z.number().catch(0),
  last_response_status: z.number().nullable().optional().catch(null),
  last_error: z.string().nullable().optional().catch(null),
});
export type FailingEndpoint = z.infer<typeof failingEndpointSchema>;

export const webhookHealthSchema = z.object({
  totals: z.object({ delivered: z.number().catch(0), failed: z.number().catch(0), pending: z.number().catch(0) }).catch({ delivered: 0, failed: 0, pending: 0 }),
  days: z.array(z.object({ date: z.string(), delivered: z.number().catch(0), failed: z.number().catch(0) })).catch([]),
  endpoints: z.object({ active: z.number().catch(0), failing: z.number().catch(0), disabled: z.number().catch(0) }).catch({ active: 0, failing: 0, disabled: 0 }),
  failing: z.array(failingEndpointSchema).catch([]),
});
export type WebhookHealth = z.infer<typeof webhookHealthSchema>;

/** Where an endpoint answered, in words: "500", "no answer". */
export function answeredText(e: Pick<FailingEndpoint, "last_response_status" | "last_error">): string {
  if (e.last_response_status) return `answered ${e.last_response_status}`;
  return e.last_error ? e.last_error : "no answer";
}
