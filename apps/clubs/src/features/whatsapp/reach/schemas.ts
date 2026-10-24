import { z } from "zod";

/**
 * A club's own WhatsApp number, further (app/api/club_whatsapp on the
 * backend: delivery_routes, spend, broadcasts, embedded_signup): routing by
 * kind, Meta's spend this month, broadcasts, and "Connect with Meta".
 *
 * Every shape reads what it can: a field an older server leaves out is its
 * empty form, never a failed page. A server without these routes answers a
 * bare 404, which the queries read as `null` -- and then none of it is shown.
 */

const str = z.string().nullish().catch(null);
const n = z.coerce.number().catch(0);
const nOrNull = z.coerce.number().nullish().catch(null);

// ─── Routing by kind, and Connect with Meta ─────────────────────────────

export const KIND_KEYS = ["tickets", "certificates", "reminders"] as const;
export type KindKey = (typeof KIND_KEYS)[number];
export const KIND_LABEL: Record<KindKey, string> = { tickets: "Tickets", certificates: "Certificates", reminders: "Day-before reminders" };

const ALL_ON = { tickets: true, certificates: true, reminders: true };

export const kindsSchema = z.object({
  tickets: z.boolean().catch(true),
  certificates: z.boolean().catch(true),
  reminders: z.boolean().catch(true),
});
export type Kinds = z.infer<typeof kindsSchema>;

/** What the dashboard opens Meta's flow with: set only while the backend has it switched on. */
export const embeddedConfigSchema = z.object({
  app_id: z.string(),
  config_id: z.string(),
  graph_version: z.string().catch("v24.0"),
  version: z.string().catch("v5"),
});
export type EmbeddedConfig = z.infer<typeof embeddedConfigSchema>;

export const reachSchema = z.object({
  routing: z.boolean().catch(true),
  kinds: kindsSchema.catch(ALL_ON),
  embedded_signup: embeddedConfigSchema.nullish().catch(null),
  mode: str,
  token_expires_at: str,
  registered_at: str,
  on_biz_app: z.boolean().catch(false),
  mm_status: str,
  messaging_limit: z.object({ tier: str, per_day: nOrNull }).catch({ tier: null, per_day: null }),
  consent_text_version: z.string().catch(""),
  consent_text: z.string().catch(""),
});
export type Reach = z.infer<typeof reachSchema>;

// ─── Spend ───────────────────────────────────────────────────────────────

export const spendSchema = z.object({
  /** YYYY-MM. */
  month: z.string().catch(""),
  currency: str,
  /** When Meta's figure was read (the sweep, at most daily); null: not yet this month. */
  fetched_at: str,
  categories: z.array(z.object({ category: z.string(), volume: n, cost: n })).catch([]),
  volume: n,
  cost: n,
  approximate: z.boolean().catch(true),
  note: z.string().catch(""),
  from_your_number: z
    .object({ deliveries: n, broadcasts: n, inbox: n, total: n })
    .catch({ deliveries: 0, broadcasts: 0, inbox: 0, total: 0 }),
  fallbacks: z.array(z.object({ code: str, reason: str, count: n })).catch([]),
  fallback_total: n,
});
export type Spend = z.infer<typeof spendSchema>;

export const CATEGORY_LABEL: Record<string, string> = {
  MARKETING: "Marketing",
  MARKETING_LITE: "Marketing (Meta's MM API)",
  UTILITY: "Utility",
  AUTHENTICATION: "Authentication",
  AUTHENTICATION_INTERNATIONAL: "Authentication (international)",
  SERVICE: "Service (replies)",
  REFERRAL_CONVERSION: "Free entry point",
};

/** An amount in the account's currency, as India writes it: ₹1,234.56. */
export function money(amount: number, currency: string | null | undefined, digits = 2): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
  } catch {
    return `${currency ?? ""} ${amount.toFixed(digits)}`.trim();
  }
}

// ─── Broadcasts ──────────────────────────────────────────────────────────

export const SOURCES = ["name", "event_name", "event_date", "text"] as const;
export type Source = (typeof SOURCES)[number];
export const SOURCE_LABEL: Record<Source, string> = {
  name: "Their first name",
  event_name: "The event's name",
  event_date: "The event's date",
  text: "Your own words",
};
export interface Variable {
  source: Source;
  value?: string;
}
export interface Variables {
  header: Variable[];
  body: Variable[];
  buttons: Record<string, Variable>;
}

export const BROADCAST_KINDS = ["event_update", "promotion"] as const;
export type BroadcastKind = (typeof BROADCAST_KINDS)[number];
export const KIND_OF_CATEGORY: Record<string, BroadcastKind> = { UTILITY: "event_update", MARKETING: "promotion" };
export const BROADCAST_KIND_LABEL: Record<BroadcastKind, string> = { event_update: "Event update", promotion: "Promotion" };
export const BROADCAST_KIND_HELP: Record<BroadcastKind, string> = {
  event_update: "A UTILITY template, to the people registered for one event who asked for WhatsApp.",
  promotion: "A MARKETING template, to the people who ticked \"Get updates from your club on WhatsApp\".",
};

export const limitSchema = z.object({ tier: str, per_day: nOrNull, used_today: n, today: n, days: z.coerce.number().catch(1) });

export const estimateSchema = z.object({
  recipients: n,
  category: z.string().catch(""),
  currency: z.string().catch("INR"),
  rate: n,
  subtotal: n,
  gst_rate: n,
  gst: n,
  total: n,
  estimate: z.boolean().catch(true),
  label: z.string().catch(""),
  messaging_limit: limitSchema.catch({ tier: null, per_day: null, used_today: 0, today: 0, days: 1 }),
});
export type Estimate = z.infer<typeof estimateSchema>;

export const excludedSchema = z.object({ opted_out: n, no_consent: n, no_number: n });

export const previewSchema = z.object({
  kind: z.enum(BROADCAST_KINDS).catch("event_update"),
  category: z.string().catch(""),
  template: z.string().catch(""),
  language: z.string().catch(""),
  event_id: nOrNull,
  recipients: n,
  excluded: excludedSchema.catch({ opted_out: 0, no_consent: 0, no_number: 0 }),
  estimate: estimateSchema,
  sample: z.string().catch(""),
});
export type Preview = z.infer<typeof previewSchema>;

export const resultsSchema = z.object({
  recipients: n,
  queued: n,
  waiting: n,
  sent: n,
  delivered: n,
  read: n,
  failed: n,
  failed_by_reason: z.array(z.object({ code: str, title: str, count: n })).catch([]),
  skipped: z
    .object({ opted_out: n, no_consent: n, no_number: n, limit_spill: n, cancelled: n, not_sent: n })
    .catch({ opted_out: 0, no_consent: 0, no_number: 0, limit_spill: 0, cancelled: 0, not_sent: 0 }),
});
export type Results = z.infer<typeof resultsSchema>;

export const BROADCAST_STATUSES = ["scheduled", "sending", "done", "cancelled", "failed"] as const;
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number];
export const BROADCAST_STATUS: Record<BroadcastStatus, { label: string; tone: "info" | "success" | "default" | "destructive" }> = {
  scheduled: { label: "Scheduled", tone: "info" },
  sending: { label: "Sending", tone: "info" },
  done: { label: "Sent", tone: "success" },
  cancelled: { label: "Cancelled", tone: "default" },
  failed: { label: "Stopped", tone: "destructive" },
};

export const broadcastSchema = z.object({
  id: z.coerce.number(),
  kind: z.enum(BROADCAST_KINDS).catch("event_update"),
  template: z.string().catch(""),
  language: z.string().catch(""),
  category: z.string().catch(""),
  event: z.object({ id: z.coerce.number(), name: z.string().catch("") }).nullish().catch(null),
  status: z.enum(BROADCAST_STATUSES).catch("done"),
  scheduled_at: str,
  started_at: str,
  finished_at: str,
  created_at: str,
  created_by: str,
  endpoint: str,
  estimate: estimateSchema.nullish().catch(null),
  last_error: str,
  results: resultsSchema.catch({
    recipients: 0, queued: 0, waiting: 0, sent: 0, delivered: 0, read: 0, failed: 0, failed_by_reason: [],
    skipped: { opted_out: 0, no_consent: 0, no_number: 0, limit_spill: 0, cancelled: 0, not_sent: 0 },
  }),
});
export type Broadcast = z.infer<typeof broadcastSchema>;

export const broadcastListSchema = z.object({ items: z.array(broadcastSchema).catch([]), total: n });
export type BroadcastList = z.infer<typeof broadcastListSchema>;

/** What a broadcast's people were skipped for, in words. */
export const SKIP_LABEL: Record<keyof Results["skipped"], string> = {
  opted_out: "asked you to stop",
  no_consent: "never said yes",
  no_number: "no number WhatsApp reaches",
  limit_spill: "held to a later day by your messaging limit",
  cancelled: "cancelled",
  not_sent: "not sent (it stopped)",
};

/** Meta's codes a broadcast's failures commonly carry, in plain words. */
export const FAILED_CODE_LABEL: Record<string, string> = {
  "131026": "WhatsApp can't reach this number",
  "131049": "Meta's limit on marketing messages to one person (tried again a day later)",
  "131050": "They stopped your marketing messages in WhatsApp",
  "130472": "Part of an experiment Meta runs",
  UNCONFIRMED: "Meta didn't answer; it may have gone",
  VALUES: "A value for them was empty",
};

// ─── Connect with Meta ───────────────────────────────────────────────────

/** Embedded Signup's screens, by the `current_step` a CANCEL names (Meta's "abandoned flow screens"). */
export const SIGNUP_STEP_LABEL: Record<string, string> = {
  BUSINESS_ACCOUNT_SELECTION: "picking the business portfolio",
  WABA_PHONE_PROFILE_PICKER: "picking the WhatsApp account",
  WHATSAPP_BUSINESS_PROFILE_SETUP: "creating the WhatsApp account",
  PHONE_NUMBER_SETUP: "adding the phone number",
  PHONE_NUMBER_VERIFICATION: "verifying the phone number",
  PERMISSIONS: "reviewing the permissions",
};
