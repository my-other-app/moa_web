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
/** A name as the server keeps it, or a person. */
const byField = z.union([z.string(), personSchema]).nullable().optional().catch(null);

export function byName(v: string | { name?: string | null; email?: string | null } | null | undefined): string | null {
  if (!v) return null;
  const name = typeof v === "string" ? v : (v.name ?? v.email ?? null);
  return name === "The club's own account" ? "the club account" : name;
}

const scopeRef = z.union([z.string(), z.object({ key: z.string() }).passthrough()]).transform((v) => (typeof v === "string" ? v : v.key));

/**
 * A club's API access as GET /admin/integrations/clubs lists it
 * (app/api/partner/admin_router.py): `enabled` is whether it is on now,
 * `source` who gave it ("admin", or "plan" when a plan carries `api_access`).
 */
export const allocationSchema = z
  .object({
    club: z.object({ id: z.coerce.number(), name: z.string(), slug: z.string().nullable().optional().catch(null), verified: z.boolean().optional().catch(true) }),
    enabled: z.boolean().optional(),
    allocated: z.boolean().optional(),
    rate_tier: z.string().catch("standard"),
    rate_limit: z.object({ read_per_min: z.number(), write_per_min: z.number() }).nullable().optional().catch(null),
    max_keys: z.number().catch(DEFAULT_MAX_KEYS),
    notes: z.string().nullable().optional().catch(null),
    source: z.string().nullable().optional().catch(null),
    updated_at: z.string().nullable().optional().catch(null),
    live_keys: z.number().optional().catch(0),
  })
  .transform(({ enabled, allocated, live_keys, ...r }) => ({ ...r, allocated: Boolean(enabled ?? allocated), keys_active: live_keys ?? 0 }));
export type Allocation = z.infer<typeof allocationSchema>;

export const allocationListSchema = z
  .object({ clubs: z.array(allocationSchema).optional(), items: z.array(allocationSchema).optional() })
  .transform((r) => r.clubs ?? r.items ?? []);

export const clubKeySchema = z.object({
  id: z.coerce.string(),
  name: z.string().catch("API key"),
  prefix: z.string().catch(""),
  mode: z.string().catch("live"),
  scopes: z.array(scopeRef).catch([]),
  last_used_at: z.string().nullable().optional().catch(null),
  created_at: z.string().nullable().optional().catch(null),
  created_by: byField,
  revoked_at: z.string().nullable().optional().catch(null),
  expired: z.boolean().catch(false),
});
export type ClubKey = z.infer<typeof clubKeySchema>;

export const usageSchema = z.object({
  days: z
    .array(
      z
        .object({ day: z.string().optional(), date: z.string().optional(), requests: z.number().catch(0), errors: z.number().catch(0) })
        .transform((d) => ({ date: d.day ?? d.date ?? "", requests: d.requests, errors: d.errors })),
    )
    .catch([]),
});
export type Usage = z.infer<typeof usageSchema>;

const connectionShape = z.object({
  id: z.coerce.string(),
  mode: z.string().catch("live"),
  scopes: z.array(scopeRef).catch([]),
  connected_by: byField,
  connected_at: z.string().nullable().optional().catch(null),
  last_used_at: z.string().nullable().optional().catch(null),
});

/** GET /admin/integrations/clubs/{id}: the allocation, every key (revoked too), connected apps and 30 days of use. */
export const clubDetailSchema = z
  .object({
    keys: z.array(clubKeySchema).catch([]),
    connected_apps: z.array(connectionShape.extend({ app: z.object({ id: z.coerce.string(), name: z.string() }).nullable().optional().catch(null) })).catch([]),
    usage: usageSchema.shape.days,
  })
  .passthrough();
export type ClubDetail = z.infer<typeof clubDetailSchema>;

export interface AllocationBody {
  enabled: boolean;
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
  if (!/^\d+$/.test(f.maxKeys.trim()) || n > 100) out.maxKeys = "A whole number from 0 to 100.";
  if (f.notes.length > 1000) out.notes = "Keep notes to 1,000 characters.";
  return out;
}

export const ACCESS_FILTERS = [
  { value: "allocated", label: "On" },
  { value: "revoked", label: "Off" },
] as const;

export const SOURCE_LABEL: Record<string, string> = { admin: "Given here", plan: "With its plan" };

// ─── Partner apps ────────────────────────────────────────────────────────

export const partnerAppSchema = z
  .object({
    id: z.coerce.string(),
    name: z.string(),
    client_id: z.string(),
    description: z.string().nullable().optional().catch(null),
    logo_url: z.string().nullable().optional().catch(null),
    website: z.string().nullable().optional().catch(null),
    contact_email: z.string().nullable().optional().catch(null),
    redirect_uris: z.array(z.string()).catch([]),
    allowed_scopes: z.array(scopeRef).catch([]),
    rate_tier: z.string().catch("standard"),
    /** "active" or "suspended"; kept as the server says it. */
    status: z.string().catch("active"),
    suspended_at: z.string().nullable().optional().catch(null),
    suspended_reason: z.string().nullable().optional().catch(null),
    secret_rotated_at: z.string().nullable().optional().catch(null),
    created_at: z.string().nullable().optional().catch(null),
    connected_clubs: z.number().optional().catch(0),
  })
  .transform(({ connected_clubs, ...a }) => ({ ...a, clubs_connected: connected_clubs ?? 0 }));
export type PartnerApp = z.infer<typeof partnerAppSchema>;

export const partnerAppListSchema = z
  .object({ apps: z.array(partnerAppSchema).optional(), items: z.array(partnerAppSchema).optional() })
  .transform((r) => r.apps ?? r.items ?? []);

/** A new app, or one whose secret was replaced: the app with its `client_secret`, which the server never sends again. */
export const partnerAppWithSecretSchema = z
  .object({ client_secret: z.string().min(1) })
  .passthrough()
  .transform(({ client_secret, ...rest }) => ({ app: partnerAppSchema.parse(rest), client_secret }));
export type PartnerAppWithSecret = z.infer<typeof partnerAppWithSecretSchema>;

export const partnerConnectionSchema = connectionShape.extend({
  club: z.object({ id: z.coerce.number(), name: z.string().nullable().catch(null) }).catch({ id: 0, name: null }),
});
export type PartnerConnection = z.infer<typeof partnerConnectionSchema>;

/** GET /admin/integrations/partner-apps/{id}: the app and the clubs connected to it. */
export const partnerDetailSchema = z
  .object({ connections: z.array(partnerConnectionSchema).catch([]) })
  .passthrough()
  .transform(({ connections, ...rest }) => ({ app: partnerAppSchema.parse(rest), connections }));

export interface PartnerAppBody {
  name: string;
  description: string | null;
  logo_url: string | null;
  website: string | null;
  contact_email: string | null;
  redirect_uris: string[];
  allowed_scopes: string[];
  rate_tier: RateTier;
}

export interface PartnerAppForm {
  name: string;
  description: string;
  logoUrl: string;
  website: string;
  contactEmail: string;
  redirects: string;
  scopes: string[];
  tier: RateTier;
}

export const EMPTY_PARTNER_FORM: PartnerAppForm = { name: "", description: "", logoUrl: "", website: "", contactEmail: "", redirects: "", scopes: [], tier: "standard" };

export function partnerFormFrom(app: PartnerApp): PartnerAppForm {
  return {
    name: app.name,
    description: app.description ?? "",
    logoUrl: app.logo_url ?? "",
    website: app.website ?? "",
    contactEmail: app.contact_email ?? "",
    redirects: app.redirect_uris.join("\n"),
    scopes: app.allowed_scopes,
    tier: (RATE_TIERS as readonly string[]).includes(app.rate_tier) ? (app.rate_tier as RateTier) : "standard",
  };
}

function httpsUrl(text: string): boolean {
  try {
    return new URL(text).protocol === "https:";
  } catch {
    return false;
  }
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** A redirect URI the server takes: https, or http back to this computer while a partner builds; never a fragment. */
export function redirectProblem(uri: string): string | null {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return `${uri} isn't an address`;
  }
  if (url.hash) return `${uri} mustn't have a # part`;
  if (url.protocol === "https:" && url.hostname) return null;
  if (url.protocol === "http:" && LOOPBACK.has(url.hostname)) return null;
  return `${uri} must use https (http only for localhost)`;
}

export function splitLines(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
}

type PartnerField = "name" | "logoUrl" | "website" | "contactEmail" | "redirects" | "scopes" | "description";

export function partnerProblems(f: PartnerAppForm): Partial<Record<PartnerField, string>> {
  const out: Partial<Record<PartnerField, string>> = {};
  if (!f.name.trim()) out.name = "Give the app its name, as clubs will see it.";
  else if (f.name.trim().length > 120) out.name = "Keep the name to 120 characters.";
  if (f.description.length > 500) out.description = "Keep it to 500 characters.";
  if (f.logoUrl.trim() && !httpsUrl(f.logoUrl.trim())) out.logoUrl = "An https address of the logo.";
  if (f.website.trim() && !httpsUrl(f.website.trim())) out.website = "An https address.";
  if (f.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contactEmail.trim())) out.contactEmail = "An email address.";
  const uris = splitLines(f.redirects);
  if (uris.length === 0) out.redirects = "At least one address to send people back to after they allow it.";
  else if (uris.length > 10) out.redirects = "At most ten.";
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
    description: f.description.trim() || null,
    logo_url: f.logoUrl.trim() || null,
    website: f.website.trim() || null,
    contact_email: f.contactEmail.trim() || null,
    redirect_uris: splitLines(f.redirects),
    allowed_scopes: orderScopes(f.scopes),
    rate_tier: f.tier,
  };
}

export function isSuspended(app: Pick<PartnerApp, "status">): boolean {
  return app.status === "suspended";
}

// ─── Webhook health ──────────────────────────────────────────────────────

const failingShape = z.object({
  id: z.coerce.string(),
  url: z.string(),
  club_id: z.coerce.number().nullable().optional().catch(null),
  club_name: z.string().nullable().optional().catch(null),
  owner: z.object({ type: z.string().catch("club") }).nullable().optional().catch(null),
  enabled: z.boolean().catch(true),
  disabled_reason: z.string().nullable().optional().catch(null),
  failing_since: z.string().nullable().optional().catch(null),
  consecutive_failures: z.number().catch(0),
  last_failure_at: z.string().nullable().optional().catch(null),
  last_error: z.string().nullable().optional().catch(null),
});

export const failingEndpointSchema = failingShape.transform((e) => ({
  endpoint_id: e.id,
  url: e.url,
  club: e.club_id ? { id: e.club_id, name: e.club_name ?? `Club ${e.club_id}` } : null,
  by_partner: e.owner?.type === "partner_app",
  enabled: e.enabled,
  failing_since: e.failing_since ?? null,
  consecutive_failures: e.consecutive_failures,
  last_failure_at: e.last_failure_at ?? null,
  last_error: e.last_error ?? null,
}));
export type FailingEndpoint = z.infer<typeof failingEndpointSchema>;

/**
 * GET /admin/integrations/webhooks/health (app/api/webhooks_out/router.py),
 * folded into what the page shows: the week's totals, a day per bar, the
 * endpoints by state, the failing ones, and the busiest clubs.
 */
export const webhookHealthSchema = z
  .object({
    endpoints: z
      .object({ total: z.number().catch(0), enabled: z.number().catch(0), turned_off_failing: z.number().catch(0), failing_now: z.number().catch(0) })
      .catch({ total: 0, enabled: 0, turned_off_failing: 0, failing_now: 0 }),
    per_day: z
      .array(z.object({ day: z.string(), deliveries: z.number().catch(0), succeeded: z.number().catch(0), failed: z.number().catch(0), waiting: z.number().catch(0) }))
      .catch([]),
    top_clubs_7d: z.array(z.object({ club_id: z.coerce.number(), club_name: z.string().catch(""), deliveries: z.number().catch(0), failed: z.number().catch(0) })).catch([]),
    failing_endpoints: z.array(failingEndpointSchema).catch([]),
  })
  .transform((h) => ({
    totals: {
      delivered: h.per_day.reduce((n, d) => n + d.succeeded, 0),
      failed: h.per_day.reduce((n, d) => n + d.failed, 0),
      pending: h.per_day.reduce((n, d) => n + d.waiting, 0),
    },
    days: h.per_day.map((d) => ({ date: d.day, delivered: d.succeeded, failed: d.failed })),
    endpoints: { total: h.endpoints.total, active: h.endpoints.enabled, failing: h.endpoints.failing_now, disabled: h.endpoints.turned_off_failing },
    failing: h.failing_endpoints,
    topClubs: h.top_clubs_7d,
  }));
export type WebhookHealth = z.infer<typeof webhookHealthSchema>;

/** What the endpoint last said, in words. */
export function answeredText(e: Pick<FailingEndpoint, "last_error">): string {
  return e.last_error ? e.last_error.replace(/\.$/, "") : "no answer";
}

// ─── Developer docs links ────────────────────────────────────────────────

/**
 * The docs' guides, reference, spec and Postman file are private
 * (feature-register/private-dev-docs-contract.md): they open through a
 * signed link. An admin who may manage content makes one for themselves
 * (7 days) or for a partner app's developers (30 days); a club's owner or
 * admin makes theirs in the club dashboard. Every link is listed here, and
 * any that still works can be revoked. The link carries its token, so the
 * server gives it once; the list never has it.
 */
export const DOCS_SHARE_DAYS = 30;
export const DOCS_LABEL_MAX = 80;

/** What someone sharing a link is told, word for word. */
export const DOCS_SHARE_WARNING = `Anyone with this link can read the docs until it expires (${DOCS_SHARE_DAYS} days) or you revoke it.`;

export const DOCS_KINDS = ["club", "partner_app", "admin"] as const;
export type DocsKind = (typeof DOCS_KINDS)[number];

export const DOCS_KIND_FILTERS = [
  { value: "club", label: "Clubs" },
  { value: "partner_app", label: "Partner apps" },
  { value: "admin", label: "Admins" },
];

export const DOCS_STATUS_FILTERS = [
  { value: "active", label: "Working" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" },
];

const ref = (id: z.ZodTypeAny) => z.object({ id, name: z.string().nullable().optional().catch(null) }).nullable().optional().catch(null);

export const docsLinkSchema = z.object({
  id: z.coerce.string(),
  label: z.string().nullable().optional().catch(null),
  kind: z.string().catch("admin"),
  /** "self" (the maker's own) or "share" (a club's developer, a partner app's). */
  purpose: z.string().nullable().optional().catch(null),
  status: z.enum(["active", "expired", "revoked"]).nullable().optional().catch(null),
  club: ref(z.coerce.number()),
  partner_app: ref(z.coerce.string()),
  created_by: byField,
  created_at: z.string().nullable().optional().catch(null),
  expires_at: z.string().nullable().optional().catch(null),
  last_used_at: z.string().nullable().optional().catch(null),
  use_count: z.number().catch(0),
  revoked_at: z.string().nullable().optional().catch(null),
});
export type DocsLink = z.infer<typeof docsLinkSchema>;

/** `{links: [...]}`, newest first. */
export const docsLinksSchema = z
  .object({ links: z.array(docsLinkSchema).optional(), items: z.array(docsLinkSchema).optional() })
  .transform((r) => r.links ?? r.items ?? []);

/** Only a web address is opened or copied. */
export function safeDocsUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** A new link: its row, and `url`, the link itself with its token, which the server never sends again. */
export const docsLinkCreatedSchema = z
  .object({ link: docsLinkSchema, url: z.string().min(1) })
  .transform((r, ctx) => {
    const url = safeDocsUrl(r.url);
    if (!url) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "The docs link isn't a web address." });
      return z.NEVER;
    }
    return { link: r.link, url };
  });
export type DocsLinkCreated = z.infer<typeof docsLinkCreatedSchema>;

export type DocsLinkBody = { purpose: "self" } | { partner_app_id: string; label?: string };

/** The body for a partner app's link: a label only when one is given, trimmed and within its length. */
export function appDocsLinkBody(appId: string, label = ""): DocsLinkBody {
  const text = label.trim().slice(0, DOCS_LABEL_MAX);
  return text ? { partner_app_id: appId, label: text } : { partner_app_id: appId };
}

export type DocsStatus = "active" | "expired" | "revoked";

/** Working, expired or revoked: revoked and expired as the server said, or by the dates now. */
export function docsLinkStatus(l: Pick<DocsLink, "status" | "revoked_at" | "expires_at">, now: Date = new Date()): DocsStatus {
  if (l.revoked_at || l.status === "revoked") return "revoked";
  if (l.status === "expired" || (l.expires_at && new Date(l.expires_at) <= now)) return "expired";
  return "active";
}

export const DOCS_STATUS_LABEL: Record<DocsStatus, string> = { active: "Working", expired: "Expired", revoked: "Revoked" };

/** Whose link it is: "GDG Trivandrum", "EventHub (partner app)", "Admin". */
export function docsLinkFor(l: Pick<DocsLink, "kind" | "club" | "partner_app">): string {
  if (l.kind === "club") return l.club?.name ?? (l.club ? `Club ${l.club.id}` : "A club");
  if (l.kind === "partner_app") return `${l.partner_app?.name ?? "A partner app"} (partner app)`;
  return "Admin";
}

/** What a link is called: its label, or what it was made for. */
export function docsLinkName(l: Pick<DocsLink, "label" | "purpose" | "kind">): string {
  if (l.label?.trim()) return l.label.trim();
  if (l.kind === "partner_app") return "For the app's developers";
  return l.purpose === "share" ? "Shared link" : "Opened from the dashboard";
}
