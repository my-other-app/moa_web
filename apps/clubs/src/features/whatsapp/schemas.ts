import { z } from "zod";

/**
 * The club's own WhatsApp Business number (an Enterprise feature), against
 * the backend's contract (app/api/club_whatsapp):
 *
 *   GET/PUT/PATCH/DELETE /clubs/whatsapp/account, POST /account/verify
 *   GET  /clubs/whatsapp/overview
 *   GET  /clubs/whatsapp/conversations, POST /conversations
 *   GET/POST /conversations/{id}/messages, POST /{id}/read, PATCH /{id}
 *   GET  /clubs/whatsapp/media/{message_id}   (the authenticated proxy)
 *   GET  /clubs/whatsapp/stream               (server-sent events, or 404: poll)
 *   GET/POST /clubs/whatsapp/templates, DELETE /templates/{name}, POST /templates/standard
 *
 * Every shape tolerates a field it does not know, or one missing: a value
 * this build cannot read becomes its empty form rather than failing the page.
 */

const str = z.string().nullish().catch(null);
const num = z.number().nullish().catch(null);
/** A field newer servers add: an older one leaves it out, and it reads as null. */
const added = z.string().nullish().default(null).catch(null);

// ─── The connection ─────────────────────────────────────────────────────

export const ACCOUNT_STATUSES = ["active", "failed", "disconnected"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const upgradeSchema = z.object({
  feature: str,
  label: str,
  required_plan: str,
  required_plan_name: str,
  upgrade_url: str,
});
export type Upgrade = z.infer<typeof upgradeSchema>;

export const accountSchema = z.object({
  /** False: the server has no WHATSAPP_KEYS_SECRET, so nothing can be connected. */
  available: z.boolean().catch(false),
  /** False: the club's plan lacks `whatsapp_own`; `upgrade` names the plan that has it. */
  plan_allows: z.boolean().catch(true),
  upgrade: upgradeSchema.nullish().catch(null),
  connected: z.boolean().catch(false),
  status: z.enum(ACCOUNT_STATUSES).nullish().catch(null),
  mode: str,
  waba_id: str,
  phone_number_id: str,
  app_id: str,
  display_phone_number: str,
  verified_name: str,
  token_last4: str,
  quality_rating: str,
  messaging_limit_tier: str,
  quality_checked_at: str,
  verified_at: str,
  last_webhook_at: str,
  last_error: str,
  last_error_code: str,
  routing: z.boolean().catch(true),
  retention_months: z.number().catch(12),
  webhook_url: str,
  /** Only to those who manage the connection, and only while connected. */
  verify_token: str,
  webhook_fields: z.array(z.string()).catch([]),
  can_manage: z.boolean().catch(false),
  can_inbox: z.boolean().catch(false),
  /**
   * A platform admin acting as the club: it sees the connection and its
   * quality, never the messages (`can_inbox` is false). Newer servers only.
   */
  impersonated: z.boolean().default(false).catch(false),
  /** Meta's cautions about the account (billing, currency), in words. Newer servers only. */
  warnings: z.array(z.string()).default([]).catch([]),
  /**
   * Never read from the server: any answer at all means the API has the
   * WhatsApp routes. Only NOT_ON_THIS_SERVER (queries.ts), what a route-level
   * 404 reads as, says false -- and then the section isn't shown anywhere.
   */
  on_server: z.unknown().transform((): boolean => true),
});
export type Account = z.infer<typeof accountSchema>;

export const keysSchema = z.object({
  waba_id: z
    .string()
    .trim()
    .min(1, "Paste the WhatsApp Business Account ID.")
    .regex(/^\d{5,25}$/, "It's a long number, under WhatsApp → API Setup."),
  phone_number_id: z
    .string()
    .trim()
    .min(1, "Paste the phone number ID.")
    .regex(/^\d{5,25}$/, "It's the long ID under your number in API Setup, not the phone number."),
  access_token: z.string().trim().min(20, "Paste the whole permanent token of your system user."),
  app_secret: z
    .string()
    .trim()
    .min(1, "Paste the app secret.")
    .regex(/^[0-9a-fA-F]{32}$/, "It's 32 letters and digits, under App settings → Basic."),
  app_id: z
    .string()
    .trim()
    .regex(/^(\d{5,25})?$/, "It's the long number at the top of your app's dashboard.")
    .optional(),
});
export type Keys = z.infer<typeof keysSchema>;
export type KeyField = keyof Keys;

export const qualityPointSchema = z.object({
  quality_rating: str,
  messaging_limit_tier: str,
  previous_rating: str,
  previous_tier: str,
  source: z.string().catch(""),
  created_at: z.string().catch(""),
});
export type QualityPoint = z.infer<typeof qualityPointSchema>;

export const statsSchema = z.object({
  days: z.number().catch(7),
  conversations: z.number().catch(0),
  open: z.number().catch(0),
  unanswered: z.number().catch(0),
  unread: z.number().catch(0),
  window_open: z.number().catch(0),
  received: z.number().catch(0),
  replies: z.number().catch(0),
  sent_by_deliveries: z.number().catch(0),
  median_response_seconds: num,
  average_response_seconds: num,
  oldest_unanswered_at: str,
});
export type Stats = z.infer<typeof statsSchema>;

export const overviewSchema = z.object({
  account: accountSchema,
  stats: statsSchema.nullish().catch(null),
  quality_history: z.array(qualityPointSchema).catch([]),
});
export type Overview = z.infer<typeof overviewSchema>;

// ─── The inbox ───────────────────────────────────────────────────────────

export const FILTERS = ["all", "open", "unanswered", "unread", "closed"] as const;
export type InboxFilter = (typeof FILTERS)[number];
export const FILTER_LABEL: Record<InboxFilter, string> = {
  all: "All",
  open: "Open",
  unanswered: "Unanswered",
  unread: "Unread",
  closed: "Closed",
};

export const contactEventSchema = z.object({
  id: z.number(),
  name: str,
  event_datetime: str,
  registration_id: str,
});

/**
 * Who someone is on WhatsApp. Someone with a WhatsApp username may share no
 * number: then `wa_id` (and `phone`) are empty and `bsuid`, Meta's
 * business-scoped ID for them, is how they are told apart. The three are
 * absent from older servers.
 */
const identity = {
  /** Their number, digits only; null when they share none. */
  wa_id: added,
  bsuid: added,
  /** Their WhatsApp username, without the @. */
  username: added,
};

export const conversationSchema = z.object({
  id: z.number(),
  ...identity,
  /** Their number to show ("+91 98470 12345"); empty when they share none. */
  phone: z.string().catch(""),
  profile_name: str,
  contact: z
    .object({
      name: str,
      user_id: num,
      registration_id: str,
      ...identity,
      events: z.array(contactEventSchema).catch([]),
    })
    .catch({ name: null, user_id: null, registration_id: null, wa_id: null, bsuid: null, username: null, events: [] }),
  status: z.enum(["open", "closed"]).catch("open"),
  unread_count: z.number().catch(0),
  awaiting_reply: z.boolean().catch(false),
  awaiting_since: str,
  last_message: z
    .object({ direction: str, type: str, preview: str, status: str, at: str })
    .nullish()
    .catch(null),
  last_inbound_at: str,
  window_open: z.boolean().catch(false),
  window_expires_at: str,
});
export type Conversation = z.infer<typeof conversationSchema>;

export const conversationListSchema = z.object({
  items: z.array(conversationSchema).catch([]),
  total: z.number().catch(0),
  unread_total: z.number().catch(0),
});
export type ConversationList = z.infer<typeof conversationListSchema>;

export const MESSAGE_STATUSES = ["received", "pending", "sent", "delivered", "read", "failed"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const messageSchema = z.object({
  id: z.number(),
  direction: z.enum(["in", "out"]).catch("in"),
  type: z.string().catch("unsupported"),
  body: str,
  media: z.object({ url: z.string(), mime: str, filename: str }).nullish().catch(null),
  location: z
    .object({ latitude: z.number().nullish(), longitude: z.number().nullish(), name: str, address: str, url: str })
    .nullish()
    .catch(null),
  template: z
    .object({ name: z.string(), language: str, params: z.record(z.unknown()).nullish().catch(null) })
    .nullish()
    .catch(null),
  context_wamid: str,
  wamid: str,
  status: z.enum(MESSAGE_STATUSES).catch("sent"),
  status_at: str,
  error: z.object({ code: str, title: str }).nullish().catch(null),
  via: str,
  sent_by: str,
  created_at: z.string().catch(""),
  wa_timestamp: str,
});
export type Message = z.infer<typeof messageSchema>;

export const messageListSchema = z.object({
  conversation: conversationSchema,
  items: z.array(messageSchema).catch([]),
  has_more: z.boolean().catch(false),
});
export type MessageList = z.infer<typeof messageListSchema>;

// ─── Templates ───────────────────────────────────────────────────────────

export const templateSchema = z.object({
  id: str,
  name: z.string(),
  language: z.string().catch(""),
  category: str,
  /** APPROVED, PENDING, REJECTED, PAUSED, DISABLED, UNUSABLE ... as Meta says it. */
  status: str,
  rejected_reason: str,
  quality: str,
  /** Meta flagged it for low quality: it may be paused next. Newer servers only. */
  flagged: z.boolean().default(false).catch(false),
  header: z
    .object({ format: str, text: str, variables: z.number().catch(0) })
    .nullish()
    .catch(null),
  body: z.string().catch(""),
  body_variables: z.number().catch(0),
  footer: str,
  buttons: z
    .array(
      z.object({
        index: z.number(),
        type: z.string().catch(""),
        text: str,
        url: str,
        phone_number: str,
        variables: z.number().catch(0),
      }),
    )
    .catch([]),
});
export type Template = z.infer<typeof templateSchema>;

export const templateListSchema = z.object({
  items: z.array(templateSchema).catch([]),
  stale: z.boolean().catch(false),
  standard_missing: z.array(z.string()).catch([]),
});
export type TemplateList = z.infer<typeof templateListSchema>;

export const standardInstallSchema = z.object({ results: z.record(z.string()).catch({}) });
export type StandardInstall = z.infer<typeof standardInstallSchema>;

export const STANDARD_LABEL: Record<string, string> = {
  ticket_confirmed: "Ticket confirmed",
  event_reminder: "Event reminder",
  certificate_ready: "Certificate ready",
};

export const TEMPLATE_CATEGORIES = ["UTILITY", "MARKETING"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];
export const BUTTON_TYPES = ["QUICK_REPLY", "URL", "PHONE_NUMBER"] as const;
export type ButtonType = (typeof BUTTON_TYPES)[number];

export interface TemplateButtonForm {
  type: ButtonType;
  text: string;
  url?: string;
  example?: string;
  phone_number?: string;
}

export interface TemplateForm {
  name: string;
  language: string;
  category: TemplateCategory;
  headerText: string;
  headerExamples: string[];
  body: string;
  bodyExamples: string[];
  footer: string;
  buttons: TemplateButtonForm[];
}

/** What the server takes (POST /templates). */
export function templateBody(form: TemplateForm) {
  const header = form.headerText.trim() ? { text: form.headerText.trim(), examples: form.headerExamples.slice(0, variables(form.headerText).length) } : null;
  return {
    name: form.name.trim(),
    language: form.language.trim(),
    category: form.category,
    header,
    body: { text: form.body.trim(), examples: form.bodyExamples.slice(0, variables(form.body).length) },
    footer: form.footer.trim() || null,
    buttons: form.buttons.map((b) => {
      if (b.type === "URL") return { type: b.type, text: b.text.trim(), url: (b.url ?? "").trim(), example: (b.example ?? "").trim() || null };
      if (b.type === "PHONE_NUMBER") return { type: b.type, text: b.text.trim(), phone_number: (b.phone_number ?? "").trim() };
      return { type: b.type, text: b.text.trim() };
    }),
  };
}

// ─── Rules shared with the server (templates.build) ──────────────────────

const VARIABLE = /\{\{\s*(\d+)\s*\}\}/g;
const ANY_BRACES = /\{\{(.*?)\}\}/g;

/** The distinct numbered variables in a text, in order: "{{1}} and {{2}}" → [1, 2]. */
export function variables(text: string | null | undefined): number[] {
  const seen = new Set<number>();
  for (const m of (text ?? "").matchAll(VARIABLE)) seen.add(Number(m[1]));
  return [...seen].sort((a, b) => a - b);
}

export const NAME_RE = /^[a-z0-9_]{1,512}$/;
export const LANGUAGE_RE = /^[a-z]{2,3}(?:_[A-Z]{2})?$/;

/** A problem with the form, on the field the server would name (`errors.field`). */
export interface TemplateProblem {
  field: string;
  text: string;
}

function checkVariables(field: string, text: string, examples: string[], { atEnds = true, most }: { atEnds?: boolean; most?: number } = {}): TemplateProblem | null {
  for (const m of text.matchAll(ANY_BRACES)) {
    if (!/^\s*\d+\s*$/.test(m[1] ?? "")) return { field, text: "Variables are numbered: {{1}}, {{2}}, and so on." };
  }
  const nums = variables(text);
  if (nums.some((n, i) => n !== i + 1)) return { field, text: "Number the variables in order from {{1}}, with none missing." };
  if (most !== undefined && nums.length > most) return { field, text: `This can have at most ${most} variable${most === 1 ? "" : "s"}.` };
  const t = text.trim();
  if (atEnds && nums.length && (/^\{\{\s*\d+\s*\}\}/.test(t) || /\{\{\s*\d+\s*\}\}$/.test(t))) {
    return { field, text: "WhatsApp doesn't accept a variable at the very start or end. Put some words before and after it." };
  }
  const given = examples.slice(0, nums.length).map((e) => e.trim());
  if (given.length !== nums.length || given.some((e) => !e)) {
    return { field: `${field}_examples`, text: `Give an example for each variable (${nums.length}), so Meta can review it.` };
  }
  return null;
}

/** The form checked as Meta (and the server) would: the first problem, or null. */
export function checkTemplate(form: TemplateForm): TemplateProblem | null {
  if (!NAME_RE.test(form.name.trim())) return { field: "name", text: "Use lowercase letters, numbers and underscores only, like event_update." };
  if (!LANGUAGE_RE.test(form.language.trim())) return { field: "language", text: "Pick a language, like en or en_US." };
  if (!TEMPLATE_CATEGORIES.includes(form.category)) return { field: "category", text: "Pick Utility or Marketing." };
  const header = form.headerText.trim();
  if (header) {
    if (header.length > 60) return { field: "header", text: "The header is at most 60 characters." };
    const p = checkVariables("header", header, form.headerExamples, { atEnds: false, most: 1 });
    if (p) return p;
  }
  const body = form.body.trim();
  if (!body) return { field: "body", text: "Write the message." };
  if (body.length > 1024) return { field: "body", text: "The message is at most 1024 characters." };
  const p = checkVariables("body", body, form.bodyExamples);
  if (p) return p;
  const footer = form.footer.trim();
  if (footer.length > 60) return { field: "footer", text: "The footer is at most 60 characters." };
  if (/\{\{.*?\}\}/.test(footer)) return { field: "footer", text: "The footer can't have variables." };
  if (form.buttons.length > 10) return { field: "buttons", text: "At most 10 buttons." };
  let urls = 0;
  let phones = 0;
  for (const [i, b] of form.buttons.entries()) {
    const field = `buttons.${i}`;
    const label = b.text.trim();
    if (!label || label.length > 25) return { field, text: "A button's text is 1 to 25 characters." };
    if (b.type === "URL") {
      urls += 1;
      const link = (b.url ?? "").trim();
      if (!link.startsWith("https://") || link.length > 2000) return { field, text: "A link button needs an address starting https://." };
      const found = [...link.matchAll(VARIABLE)].map((m) => Number(m[1]));
      if (found.length && (found.length !== 1 || found[0] !== 1 || !/\{\{\s*1\s*\}\}$/.test(link))) return { field, text: "A link can have one variable, {{1}}, at its very end." };
      if (found.length && !(b.example ?? "").trim().startsWith("https://")) return { field, text: "Give an example of the whole address, starting https://." };
    } else if (b.type === "PHONE_NUMBER") {
      phones += 1;
      if (!/^\+?\d{8,20}$/.test((b.phone_number ?? "").replace(/[\s\-()]/g, ""))) return { field, text: "A phone button needs the number with its country code." };
    }
  }
  if (urls > 2 || phones > 1) return { field: "buttons", text: "At most two link buttons and one phone button." };
  return null;
}

// ─── Words ───────────────────────────────────────────────────────────────

export const QUALITY_LABEL: Record<string, string> = { GREEN: "High", YELLOW: "Medium", RED: "Low", UNKNOWN: "Not rated yet" };
export const QUALITY_TONE: Record<string, "success" | "warning" | "destructive" | "default"> = {
  GREEN: "success",
  YELLOW: "warning",
  RED: "destructive",
  UNKNOWN: "default",
};

export function qualityLabel(rating: string | null | undefined): string {
  if (!rating) return "Not rated yet";
  return QUALITY_LABEL[rating.toUpperCase()] ?? rating;
}

export function qualityTone(rating: string | null | undefined) {
  return QUALITY_TONE[(rating ?? "UNKNOWN").toUpperCase()] ?? "default";
}

/**
 * TIER_1K as "1,000 people a day". The limit is the business portfolio's,
 * shared by all its numbers, not this number's alone (TIER_LIMIT_NOTE).
 */
export function tierWords(tier: string | null | undefined): string {
  if (!tier) return "Not set yet";
  const t = tier.toUpperCase();
  if (t === "TIER_UNLIMITED") return "No daily limit";
  const m = /^TIER_(\d+)(K)?$/.exec(t);
  if (!m) return tier;
  const n = Number(m[1]) * (m[2] ? 1000 : 1);
  return `${n.toLocaleString("en-IN")} people a day`;
}

export const TIER_LIMIT_NOTE = "Your business portfolio's limit, shared by all its numbers";

export const STATUS_LABEL: Record<AccountStatus, string> = { active: "Active", failed: "Not working", disconnected: "Disconnected" };
export const STATUS_TONE: Record<AccountStatus, "success" | "destructive" | "default"> = { active: "success", failed: "destructive", disconnected: "default" };

export const TEMPLATE_STATUS_TONE: Record<string, "success" | "warning" | "destructive" | "default" | "info"> = {
  APPROVED: "success",
  PENDING: "info",
  IN_APPEAL: "info",
  REJECTED: "destructive",
  DISABLED: "destructive",
  UNUSABLE: "destructive",
  PAUSED: "warning",
  LIMIT_EXCEEDED: "warning",
};

export function templateStatusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  if (status === "UNUSABLE") return "Can't be used";
  if (status === "IN_APPEAL") return "In appeal";
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
}

/** "40 s", "12 min", "3 h 5 min", "2 d". */
export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86_400) {
    const h = Math.floor(s / 3600);
    const m = Math.round((s % 3600) / 60);
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  return `${Math.round(s / 86_400)} d`;
}

/** The username to show, with its @: "@ananya_i", or null. */
export function handle(c: Pick<Conversation, "contact" | "username">): string | null {
  const u = (c.username || c.contact.username || "").trim().replace(/^@/, "");
  return u ? `@${u}` : null;
}

/**
 * Who a conversation is with, in the words the club knows them by: the name
 * they registered with, their WhatsApp profile name, their @username, their
 * number -- and "WhatsApp user" when they share none of those. Never a blank.
 */
export function contactName(c: Pick<Conversation, "contact" | "profile_name" | "phone" | "username">): string {
  return c.contact.name?.trim() || c.profile_name?.trim() || handle(c) || c.phone.trim() || "WhatsApp user";
}

function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

/**
 * Two initials for an avatar, whole letters as a reader sees them: a
 * Malayalam or Tamil letter with its vowel sign stays one (ദേ, not ദ),
 * and an emoji is never cut in half.
 */
export function initialsOf(name: string): string {
  // A number: its first digits, as before.
  if (/^\+?[\d\s()-]+$/.test(name.trim())) return name.replace(/\D/g, "").slice(0, 2) || "?";
  const words = name.trim().replace(/^[@+]/, "").split(/[\s_.]+/).filter(Boolean);
  const [first = "", second] = words;
  const picked = second ? [graphemes(first)[0], graphemes(second)[0]] : graphemes(first).slice(0, 2);
  return picked.join("").toLocaleUpperCase() || "?";
}

/** "Free replies for 3 h more" / "Template only: 24 h passed". */
export function windowText(c: Pick<Conversation, "window_open" | "window_expires_at" | "last_inbound_at">, now: Date = new Date()): string {
  if (c.window_open && c.window_expires_at) {
    const left = Math.max(0, new Date(c.window_expires_at).getTime() - now.getTime());
    const mins = Math.max(1, Math.round(left / 60_000));
    const when = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60 ? `${mins % 60} min` : ""}`.trim();
    return `You can reply freely for ${when} more`;
  }
  if (!c.last_inbound_at) return "They haven't written yet: start with an approved template";
  return "More than 24 hours since they last wrote: only an approved template can reach them";
}

// ─── Refusals ────────────────────────────────────────────────────────────

export const WHATSAPP_PERMISSION = "WHATSAPP_PERMISSION";
export const WHATSAPP_PRIVATE = "WHATSAPP_PRIVATE";
export const WINDOW_CLOSED = "WINDOW_CLOSED";
export const TEMPLATE_NOT_APPROVED = "TEMPLATE_NOT_APPROVED";
export const WHATSAPP_FAILED = "WHATSAPP_FAILED";
export const NO_WHATSAPP = "NO_WHATSAPP";
export const INVALID_TEMPLATE = "INVALID_TEMPLATE";
export const INVALID_WHATSAPP_KEYS = "INVALID_WHATSAPP_KEYS";

/** Which field of the connect form each of Meta's refusals is about. */
export const KEY_ERROR_FIELD: Record<string, KeyField | null> = {
  WHATSAPP_TOKEN_INVALID: "access_token",
  WHATSAPP_PERMISSION_MISSING: "access_token",
  WHATSAPP_NUMBER_NOT_FOUND: "phone_number_id",
  WHATSAPP_NUMBER_NOT_IN_WABA: "phone_number_id",
  WHATSAPP_NUMBER_IN_USE: "phone_number_id",
  WHATSAPP_APP_SECRET_WRONG: "app_secret",
  WHATSAPP_NUMBER_NOT_REGISTERED: "phone_number_id",
  WHATSAPP_ACCOUNT_BLOCKED: null,
  WHATSAPP_PAYMENT_PROBLEM: null,
  WHATSAPP_REFUSED: null,
  META_UNREACHABLE: null,
  WHATSAPP_UNAVAILABLE: null,
};

export const PERMISSION_MESSAGE = "You need the WhatsApp permission to see the club's WhatsApp. Ask the club's owner.";
export const PRIVATE_MESSAGE = "A club's WhatsApp messages are for its own team. Acting as the club, you can see the connection and its quality, not the messages.";
export const UNAVAILABLE_MESSAGE = "Connecting your own WhatsApp number isn't available right now. Your tickets still go out from MyOtherApp's number.";

// ─── Meta setup, step by step ────────────────────────────────────────────

export const META_STEPS = [
  "In Meta for Developers, create an app of type Business, and add the WhatsApp product to it.",
  "Under WhatsApp → API Setup, add your club's phone number and verify it with the code Meta sends.",
  "In Business Settings → Users → System users, add a system user (Admin), assign it your app and your WhatsApp account with full control, and generate a token that never expires with whatsapp_business_management and whatsapp_business_messaging.",
  "Copy the WhatsApp Business Account ID and the phone number ID from WhatsApp → API Setup.",
  "Copy the app secret from App settings → Basic (and the app ID at the top of the page).",
  "In WhatsApp Manager, add a payment method: Meta bills your club for the messages your number sends.",
] as const;

export const WEBHOOK_STEPS = [
  "In your app, open WhatsApp → Configuration and click Edit beside Webhook.",
  "Paste the callback URL and the verify token below, then Verify and save.",
  "Under Webhook fields, subscribe to each field listed.",
] as const;
