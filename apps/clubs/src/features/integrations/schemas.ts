import { z } from "zod";
import { ApiError } from "@moa/api";

/**
 * Integrations, as the club dashboard sees them
 * (feature-register/integrations-api-contract.md, "Dashboards"): the club's
 * API keys, its webhook endpoints and their deliveries, the partner apps
 * connected to it, how much the API was used, and the consent page a
 * partner app sends a club's owner or admin to.
 *
 * Nothing here is on by default: the MyOtherApp team allocates API access to
 * a club. Until it has (and on an API from before integrations) the section
 * stays out of sight.
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
] as const;
export type Scope = (typeof SCOPES)[number];

/** The scope that hands over people's names, emails, phones and answers (India's DPDP Act 2023). */
export const ATTENDEES_SCOPE = "attendees:read";

/** What each scope lets the other system do, in plain words. */
export const SCOPE_INFO: Record<Scope, { label: string; description: string }> = {
  "club:read": { label: "See the club", description: "Its name, tagline, about, links and logo." },
  "club:write": { label: "Change the club's profile", description: "Its name, tagline, about, links and logo. Never who owns it or its plan." },
  "events:read": { label: "See events", description: "Every event of the club, drafts included." },
  "events:write": { label: "Create and edit events", description: "New events start as drafts. Changes to a published event show at once." },
  "events:publish": { label: "Publish events", description: "Put a draft live on MyOtherApp, the website and the app." },
  "registrations:read": { label: "See registrations", description: "Each registration's status, ticket and check-in. No names or contact details." },
  "registrations:write": { label: "Register people", description: "Add registrations, change their answers, cancel free ones. Never a payment." },
  "attendees:read": { label: "See people's details", description: "Names, emails, phone numbers and form answers of everyone who registered." },
  "checkins:write": { label: "Check people in", description: "Mark someone as arrived, and undo it." },
  "certificates:read": { label: "See certificates", description: "Certificates issued, and whether one is genuine." },
  "certificates:write": { label: "Issue certificates", description: "Send certificates to the people chosen, or everyone checked in." },
  "webhooks:manage": { label: "Manage webhooks", description: "Add and change the addresses told about changes." },
};

export const SCOPE_GROUPS: { key: string; label: string; scopes: Scope[] }[] = [
  { key: "club", label: "The club", scopes: ["club:read", "club:write"] },
  { key: "events", label: "Events", scopes: ["events:read", "events:write", "events:publish"] },
  { key: "people", label: "Registrations and people", scopes: ["registrations:read", "registrations:write", "attendees:read"] },
  { key: "door", label: "At the door", scopes: ["checkins:write"] },
  { key: "certificates", label: "Certificates", scopes: ["certificates:read", "certificates:write"] },
  { key: "webhooks", label: "Webhooks", scopes: ["webhooks:manage"] },
];

/** A scope this build knows, in words; one it doesn't, as the server named it. */
export function scopeLabel(scope: string): string {
  return (SCOPE_INFO as Record<string, { label: string }>)[scope]?.label ?? scope;
}

/**
 * The scopes given, in the groups the dialog shows them in, each group in
 * its own order. A scope this build doesn't know goes in "Other", so a
 * newer server's scope is still shown, never dropped.
 */
export function groupScopes(scopes: readonly string[]): { key: string; label: string; scopes: string[] }[] {
  const given = new Set(scopes);
  const groups = SCOPE_GROUPS.map((g) => ({ key: g.key, label: g.label, scopes: g.scopes.filter((s) => given.has(s)) as string[] })).filter((g) => g.scopes.length > 0);
  const known = new Set<string>(SCOPES);
  const other = scopes.filter((s) => !known.has(s));
  return other.length ? [...groups, { key: "other", label: "Other", scopes: other }] : groups;
}

/** Granting people's details needs the club's word that its form tells them (DPDP). */
export function needsNoticeTick(scopes: readonly string[]): boolean {
  return scopes.includes(ATTENDEES_SCOPE);
}

/** The words the club ticks before people's details go to `name`. */
export function noticeText(name: string): string {
  const who = name.trim() || "this system";
  return `Our registration form tells people their details are shared with ${who}.`;
}

// ─── The club's access ───────────────────────────────────────────────────

const personSchema = z.object({
  name: z.string().nullable().optional().catch(null),
  email: z.string().nullable().optional().catch(null),
  role: z.string().nullable().optional().catch(null),
});
export type Person = z.infer<typeof personSchema>;

/** "Asha (admin)", "the club account", or "someone". */
export function personLabel(p: Person | null | undefined): string {
  if (!p) return "someone";
  if (p.role === "owner" && !p.name && !p.email) return "the club account";
  const who = p.name || p.email || "a team member";
  return p.role && p.role !== "owner" ? `${who} (${p.role})` : who;
}

/**
 * GET /clubs/integrations: whether the club has API access, and the limits
 * it comes with. `apps_connected` keeps Connected apps reachable for a club
 * that connected a partner app without API access of its own.
 */
export const statusSchema = z.object({
  allocated: z.boolean().catch(false),
  can_manage: z.boolean().catch(false),
  rate_tier: z.string().catch("standard"),
  rate_limit: z.object({ read_per_min: z.number(), write_per_min: z.number() }).nullable().catch(null),
  max_keys: z.number().catch(5),
  keys_active: z.number().catch(0),
  apps_connected: z.number().catch(0),
});
export type IntegrationsStatus = z.infer<typeof statusSchema>;

/** Whether there is anything to show: API access, or a partner app to disconnect. */
export function integrationsVisible(s: IntegrationsStatus | null | undefined): boolean {
  return Boolean(s && (s.allocated || s.apps_connected > 0));
}

/**
 * The API has no integrations: FastAPI's bare 404 (or a 405) for a path
 * nothing is mounted on. A coded refusal (NOT_ALLOCATED, ROLE_FORBIDDEN) is
 * the backend's own answer, and is not this.
 */
export function isIntegrationsMissing(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 404) return error.routeMissing;
  return error.status === 405 && error.errorCode === null;
}

/** The club is not allocated, or the role may not look: either way, nothing to show. */
export function isNotAllowed(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.errorCode === "NOT_ALLOCATED");
}

export const DOCS_URL = "https://myotherapp.in/developers";

// ─── API keys ────────────────────────────────────────────────────────────

export const KEY_MODES = ["live", "test"] as const;
export type KeyMode = (typeof KEY_MODES)[number];

export const apiKeySchema = z.object({
  id: z.coerce.string(),
  name: z.string().catch("API key"),
  /** The key's first characters ("moa_live_Ab3d"), to recognise it by; never the key itself. */
  prefix: z.string().catch(""),
  mode: z.enum(KEY_MODES).catch("live"),
  scopes: z.array(z.string()).catch([]),
  expires_at: z.string().nullable().optional().catch(null),
  ip_allowlist: z.array(z.string()).nullable().optional().catch(null),
  created_at: z.string().nullable().optional().catch(null),
  created_by: personSchema.nullable().optional().catch(null),
  last_used_at: z.string().nullable().optional().catch(null),
  last_used_ip: z.string().nullable().optional().catch(null),
  revoked_at: z.string().nullable().optional().catch(null),
});
export type ApiKey = z.infer<typeof apiKeySchema>;

export const keysSchema = z.object({ items: z.array(apiKeySchema).catch([]) });

/** A new or rotated key: the key's row, and the key itself, which the server never shows again. */
export const keyWithSecretSchema = z.object({ key: apiKeySchema, secret: z.string().min(1) });
export type KeyWithSecret = z.infer<typeof keyWithSecretSchema>;

export type KeyStatus = "active" | "expired" | "revoked";

export function keyStatus(k: Pick<ApiKey, "revoked_at" | "expires_at">, now: Date = new Date()): KeyStatus {
  if (k.revoked_at) return "revoked";
  if (k.expires_at && new Date(k.expires_at).getTime() <= now.getTime()) return "expired";
  return "active";
}

export const EXPIRY_CHOICES = [
  { value: "never", label: "Never" },
  { value: "30", label: "In 30 days" },
  { value: "90", label: "In 90 days" },
  { value: "365", label: "In a year" },
  { value: "date", label: "On a date" },
] as const;
export type ExpiryChoice = (typeof EXPIRY_CHOICES)[number]["value"];

/** When a key made now with this choice stops working: ISO, or null for never (a date ends at its midnight, IST). */
export function expiryAt(choice: ExpiryChoice, date: string, now: Date = new Date()): string | null {
  if (choice === "never") return null;
  if (choice === "date") return date ? `${date}T23:59:59+05:30` : null;
  return new Date(now.getTime() + Number(choice) * 86_400_000).toISOString();
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function isIpv6(s: string): boolean {
  if (!/^[0-9a-f:.]+$/i.test(s) || !s.includes(":")) return false;
  const halves = s.split("::");
  if (halves.length > 2) return false;
  const groups = halves.flatMap((h) => (h ? h.split(":") : []));
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g) && !IPV4.test(g))) return false;
  return halves.length === 2 ? groups.length < 8 : groups.length === 8;
}

/** One allowlist entry: an IPv4 or IPv6 address, or a range in CIDR (203.0.113.0/24). */
export function isIpEntry(entry: string): boolean {
  const [addr, bits, extra] = entry.split("/");
  if (extra !== undefined || !addr) return false;
  const v4 = IPV4.test(addr);
  if (!v4 && !isIpv6(addr)) return false;
  if (bits === undefined) return true;
  if (!/^\d{1,3}$/.test(bits)) return false;
  return Number(bits) <= (v4 ? 32 : 128);
}

/** The allowlist as typed (one a line, or commas) into entries, and the ones that aren't addresses. */
export function parseAllowlist(text: string): { entries: string[]; bad: string[] } {
  const entries = [...new Set(text.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
  return { entries, bad: entries.filter((e) => !isIpEntry(e)) };
}

export interface KeyForm {
  name: string;
  mode: KeyMode;
  scopes: string[];
  expiry: ExpiryChoice;
  expiryDate: string;
  allowlist: string;
  noticeTicked: boolean;
}

export const EMPTY_KEY_FORM: KeyForm = { name: "", mode: "live", scopes: [], expiry: "never", expiryDate: "", allowlist: "", noticeTicked: false };

/** What stops the key being made, in the dialog's words; empty when it can be. */
export function keyFormProblems(f: KeyForm, today: string = new Date().toISOString().slice(0, 10)): Partial<Record<"name" | "scopes" | "expiry" | "allowlist" | "notice", string>> {
  const out: Partial<Record<"name" | "scopes" | "expiry" | "allowlist" | "notice", string>> = {};
  const name = f.name.trim();
  if (!name) out.name = "Give it a name, such as the system that will use it.";
  else if (name.length > 60) out.name = "Keep the name to 60 characters.";
  if (f.scopes.length === 0) out.scopes = "Choose at least one thing it may do.";
  if (f.expiry === "date" && (!f.expiryDate || f.expiryDate <= today)) out.expiry = "Choose a date after today.";
  const { bad } = parseAllowlist(f.allowlist);
  if (bad.length) out.allowlist = `Not an IP address or range: ${bad.join(", ")}`;
  if (needsNoticeTick(f.scopes) && !f.noticeTicked) out.notice = "Tick this to give it people's details.";
  return out;
}

export interface CreateKeyBody {
  name: string;
  mode: KeyMode;
  scopes: string[];
  expires_at: string | null;
  ip_allowlist: string[];
  attendees_notice_ack: boolean;
}

export function keyBody(f: KeyForm, now: Date = new Date()): CreateKeyBody {
  return {
    name: f.name.trim(),
    mode: f.mode,
    // In the catalogue's order, then any this build doesn't know.
    scopes: [...SCOPES.filter((s) => f.scopes.includes(s)), ...f.scopes.filter((s) => !(SCOPES as readonly string[]).includes(s))],
    expires_at: expiryAt(f.expiry, f.expiryDate, now),
    ip_allowlist: parseAllowlist(f.allowlist).entries,
    attendees_notice_ack: needsNoticeTick(f.scopes) && f.noticeTicked,
  };
}

// ─── Webhooks ────────────────────────────────────────────────────────────

export const EVENT_TYPE_GROUPS: { label: string; types: { key: string; label: string }[] }[] = [
  {
    label: "Events",
    types: [
      { key: "event.created", label: "An event is created" },
      { key: "event.updated", label: "An event changes" },
      { key: "event.published", label: "An event is published" },
      { key: "event.cancelled", label: "An event is cancelled" },
    ],
  },
  {
    label: "Registrations",
    types: [
      { key: "registration.created", label: "Someone registers" },
      { key: "registration.updated", label: "A registration changes" },
      { key: "registration.approved", label: "A registration is confirmed" },
      { key: "registration.declined", label: "A registration is declined" },
      { key: "registration.cancelled", label: "A registration is cancelled" },
    ],
  },
  {
    label: "Check-ins",
    types: [
      { key: "checkin.created", label: "Someone is checked in" },
      { key: "checkin.deleted", label: "A check-in is undone" },
    ],
  },
  { label: "Certificates", types: [{ key: "certificate.issued", label: "A certificate is issued" }] },
  {
    label: "Payments",
    types: [
      { key: "payment.completed", label: "A payment goes through" },
      { key: "payment.refunded", label: "A payment is refunded" },
    ],
  },
  { label: "The club", types: [{ key: "club.updated", label: "The club's profile changes" }] },
];
export const EVENT_TYPES = EVENT_TYPE_GROUPS.flatMap((g) => g.types.map((t) => t.key));
export const ALL_EVENTS = "*";

export function eventTypeLabel(type: string): string {
  for (const g of EVENT_TYPE_GROUPS) for (const t of g.types) if (t.key === type) return t.label;
  return type;
}

/** "Everything", or how many of the types. */
export function eventsSummary(events: readonly string[]): string {
  if (events.includes(ALL_EVENTS)) return "Everything";
  if (events.length === 1) return eventTypeLabel(events[0]!);
  return `${events.length} kinds of change`;
}

export const endpointSchema = z.object({
  id: z.coerce.string(),
  url: z.string(),
  description: z.string().nullable().optional().catch(null),
  events: z.array(z.string()).catch([ALL_EVENTS]),
  include_own_changes: z.boolean().catch(false),
  enabled: z.boolean().catch(true),
  /** Why it is off: "failing" (3 days of failures) or "manual"; null while on. */
  disabled_reason: z.string().nullable().optional().catch(null),
  /** Made by a partner app for this club (shown, but changed by that app). */
  partner_app: z.object({ id: z.coerce.string(), name: z.string() }).nullable().optional().catch(null),
  created_at: z.string().nullable().optional().catch(null),
  last_delivery_at: z.string().nullable().optional().catch(null),
  /** The HTTP status the endpoint last answered; null when it couldn't be reached. */
  last_response_status: z.number().nullable().optional().catch(null),
  failing_since: z.string().nullable().optional().catch(null),
});
export type Endpoint = z.infer<typeof endpointSchema>;

export const endpointsSchema = z.object({ items: z.array(endpointSchema).catch([]) });

/** A new endpoint, or one whose secret was replaced: the signing secret, shown this once. */
export const endpointWithSecretSchema = z.object({ endpoint: endpointSchema, secret: z.string().min(1) });
export type EndpointWithSecret = z.infer<typeof endpointWithSecretSchema>;

export const DELIVERY_STATUSES = ["pending", "retrying", "succeeded", "failed"] as const;

export const deliverySchema = z.object({
  id: z.coerce.string(),
  /** `evt_…`, the MOA-Event-Id a receiver de-duplicates by. */
  event_id: z.string().nullable().optional().catch(null),
  type: z.string().catch("unknown"),
  status: z.string().catch("pending"),
  attempts: z.number().catch(0),
  response_status: z.number().nullable().optional().catch(null),
  error: z.string().nullable().optional().catch(null),
  duration_ms: z.number().nullable().optional().catch(null),
  created_at: z.string().nullable().optional().catch(null),
  last_attempt_at: z.string().nullable().optional().catch(null),
  next_attempt_at: z.string().nullable().optional().catch(null),
  test: z.boolean().optional().catch(false),
});
export type Delivery = z.infer<typeof deliverySchema>;

export const deliveriesSchema = z.object({
  items: z.array(deliverySchema).catch([]),
  next_cursor: z.string().nullable().optional().catch(null),
});
export type DeliveryPage = z.infer<typeof deliveriesSchema>;

export const DELIVERY_BADGE: Record<string, { label: string; tone: "default" | "success" | "warning" | "destructive" | "info" }> = {
  pending: { label: "Waiting", tone: "info" },
  retrying: { label: "Retrying", tone: "warning" },
  succeeded: { label: "Delivered", tone: "success" },
  failed: { label: "Failed", tone: "destructive" },
};

export function deliveryBadge(status: string) {
  return DELIVERY_BADGE[status] ?? { label: status.replace(/_/g, " "), tone: "default" as const };
}

/** What a test or a replay came to, for its toast. */
export function deliveryOutcome(d: Delivery): { ok: boolean; text: string } {
  const code = d.response_status;
  if (d.status === "succeeded") return { ok: true, text: `Delivered: your endpoint answered ${code ?? "OK"}.` };
  if (d.status === "pending" || d.status === "retrying") return { ok: true, text: "Queued. It shows in the delivery log as it goes." };
  if (code) return { ok: false, text: `Your endpoint answered ${code}. Anything but a 2xx counts as failed.` };
  return { ok: false, text: `Couldn't reach your endpoint${d.error ? `: ${d.error.replace(/\.$/, "")}` : ""}.` };
}

export type EndpointHealth = "ok" | "failing" | "off" | "new";

export function endpointHealth(e: Endpoint): EndpointHealth {
  if (!e.enabled) return "off";
  if (e.failing_since) return "failing";
  if (!e.last_delivery_at) return "new";
  return "ok";
}

/** An https address on a public host: what the server will take (it checks the address itself too). */
export function webhookUrlProblem(raw: string): string | null {
  const text = raw.trim();
  if (!text) return "Enter the address to send changes to.";
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return "That isn't a web address.";
  }
  if (url.protocol !== "https:") return "It must start with https://.";
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || IPV4.test(host) || host.startsWith("[")) return "Use a public address with a domain name.";
  return null;
}

export interface EndpointForm {
  url: string;
  description: string;
  all: boolean;
  events: string[];
  includeOwn: boolean;
}

export const EMPTY_ENDPOINT_FORM: EndpointForm = { url: "", description: "", all: true, events: [], includeOwn: false };

export function endpointBody(f: EndpointForm) {
  return {
    url: f.url.trim(),
    description: f.description.trim() || null,
    events: f.all ? [ALL_EVENTS] : EVENT_TYPES.filter((t) => f.events.includes(t)),
    include_own_changes: f.includeOwn,
  };
}

// ─── Connected partner apps ──────────────────────────────────────────────

export const connectionSchema = z.object({
  id: z.coerce.string(),
  partner: z.object({
    id: z.coerce.string(),
    name: z.string().catch("A partner app"),
    logo_url: z.string().nullable().optional().catch(null),
    website: z.string().nullable().optional().catch(null),
  }),
  scopes: z.array(z.string()).catch([]),
  connected_by: personSchema.nullable().optional().catch(null),
  connected_at: z.string().nullable().optional().catch(null),
  last_used_at: z.string().nullable().optional().catch(null),
});
export type Connection = z.infer<typeof connectionSchema>;

export const connectionsSchema = z.object({ items: z.array(connectionSchema).catch([]) });

/** "partner.example", from the app's website; null when it has none worth showing. */
export function hostOf(uri: string | null | undefined): string | null {
  if (!uri) return null;
  try {
    const u = new URL(uri);
    return u.protocol === "https:" || u.protocol === "http:" ? u.hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

// ─── Usage ───────────────────────────────────────────────────────────────

export const usageDaySchema = z.object({ date: z.string(), requests: z.number().catch(0), errors: z.number().catch(0) });
export type UsageDay = z.infer<typeof usageDaySchema>;

export const usageSchema = z.object({ days: z.array(usageDaySchema).catch([]) });
export type Usage = z.infer<typeof usageSchema>;

export function usageTotals(days: readonly UsageDay[]) {
  const requests = days.reduce((n, d) => n + d.requests, 0);
  const errors = days.reduce((n, d) => n + d.errors, 0);
  return { requests, errors, errorRate: requests ? errors / requests : 0 };
}

// ─── Consent (a partner app asking to connect) ───────────────────────────

export const consentSchema = z.object({
  id: z.string(),
  partner: z.object({
    id: z.coerce.string(),
    name: z.string(),
    logo_url: z.string().nullable().optional().catch(null),
    website: z.string().nullable().optional().catch(null),
  }),
  club: z.object({ id: z.coerce.number(), name: z.string(), slug: z.string().nullable().optional().catch(null), logo: z.string().nullable().optional().catch(null) }),
  /** What the app asks for (within what MyOtherApp lets it ask for). */
  scopes: z.array(z.string()).catch([]),
  /** The app is already connected to this club, with these. */
  already: z.object({ scopes: z.array(z.string()).catch([]), connected_at: z.string().nullable().optional().catch(null) }).nullable().optional().catch(null),
  /** Where the browser goes back to, as a host ("erp.college.edu"). */
  redirect_host: z.string().nullable().optional().catch(null),
  livemode: z.boolean().catch(true),
  can_decide: z.boolean().catch(false),
  cannot_decide_reason: z.string().nullable().optional().catch(null),
  expires_at: z.string().nullable().optional().catch(null),
});
export type Consent = z.infer<typeof consentSchema>;

export const consentDecisionSchema = z.object({ redirect_to: z.string().min(1) });

/** Only a web address or an app's own scheme; never script. */
export function safeRedirect(uri: string): string | null {
  try {
    const u = new URL(uri);
    return /^(javascript|data|vbscript|file):$/i.test(u.protocol) ? null : u.toString();
  } catch {
    return null;
  }
}

export const CONSENT_GONE = ["CONSENT_NOT_FOUND", "CONSENT_EXPIRED", "CONSENT_DECIDED"] as const;
