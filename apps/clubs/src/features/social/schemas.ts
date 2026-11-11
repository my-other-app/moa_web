import { z } from "zod";

/**
 * Social auto-posting (feature-register/social-posting-contract.md): the
 * club's connected accounts, each event's posts and their results, the
 * drafts and posters made from the event, and the share kit.
 *
 * Everything here is read leniently: the backend ships on its own schedule,
 * and a field it renames or leaves out must cost the page a detail, never
 * the page. Shapes the contract does not spell out (the drafts, a pending
 * choice's id on the way back from Meta) accept the likely spellings.
 */

// ─── Platforms ───────────────────────────────────────────────────────────

export const PLATFORMS = ["instagram", "facebook", "linkedin", "linkedin_page", "x"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  linkedin_page: "LinkedIn Page",
  x: "X",
};

/** What connecting needs, in one line (spec: "On the club dashboard"). */
export const PLATFORM_NEEDS: Record<Platform, string> = {
  instagram: "A Business or Creator account. A personal one can switch for free in Instagram's settings, in about a minute.",
  facebook: "A Facebook Page you are an admin of. Personal profiles and Groups can't be posted to.",
  linkedin: "Your own LinkedIn profile: posts go out as you. Access lasts 60 days, then you reconnect.",
  linkedin_page: "You must be an admin of the LinkedIn Page.",
  x: "Any X account.",
};

export const isPlatform = (p: unknown): p is Platform => typeof p === "string" && (PLATFORMS as readonly string[]).includes(p);

const platformField = z.string().refine(isPlatform) as unknown as z.ZodType<Platform>;

export const PLATFORM_REASONS = ["not_configured", "plan", "review_pending"] as const;
export type PlatformReason = (typeof PLATFORM_REASONS)[number];

export const platformRowSchema = z.object({
  platform: platformField,
  available: z.boolean().catch(false),
  reason: z.enum(PLATFORM_REASONS).nullish().catch(null),
  plan_feature: z.string().nullish().catch(null),
});
export type PlatformRow = z.infer<typeof platformRowSchema>;

/** A list whose rows the build does not know (a new platform) are dropped, not fatal. */
function rowsOf<T extends z.ZodTypeAny>(row: T) {
  return z.array(z.unknown()).transform((items) => items.flatMap((i) => {
    const r = row.safeParse(i);
    return r.success ? [r.data as z.infer<T>] : [];
  }));
}

export const platformsSchema = rowsOf(platformRowSchema);

// ─── Accounts ────────────────────────────────────────────────────────────

export const ACCOUNT_STATUSES = ["connected", "needs_reconnect", "disconnected"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

const personSchema = z
  .union([z.object({ id: z.coerce.number().nullish(), name: z.string().nullish() }).passthrough(), z.string()])
  .nullish()
  .catch(null)
  .transform((p) => (p == null ? null : typeof p === "string" ? { id: null, name: p } : { id: p.id ?? null, name: p.name ?? null }));
export type Person = z.infer<typeof personSchema>;

export const accountSchema = z.object({
  id: z.coerce.number(),
  platform: platformField,
  name: z.string().nullish().catch(null),
  handle: z.string().nullish().catch(null),
  picture_url: z.string().nullish().catch(null),
  connected_by: personSchema,
  connected_at: z.string().nullish().catch(null),
  expires_at: z.string().nullish().catch(null),
  status: z.enum(ACCOUNT_STATUSES).catch("connected"),
  waiting_posts: z.coerce.number().catch(0),
  last_error: z.string().nullish().catch(null),
});
export type SocialAccount = z.infer<typeof accountSchema>;

export const accountsSchema = rowsOf(accountSchema);

export const connectResponseSchema = z.object({ authorize_url: z.string().url() });

/** One Page or Instagram account the club may pick after Meta's sign-in. */
export const pendingChoiceSchema = z
  .object({
    external_id: z.coerce.string(),
    name: z.string().nullish().catch(null),
    picture: z.string().nullish().catch(null),
    picture_url: z.string().nullish().catch(null),
  })
  .transform((c) => ({ external_id: c.external_id, name: c.name ?? c.external_id, picture: c.picture ?? c.picture_url ?? null }));
export type PendingChoice = z.infer<typeof pendingChoiceSchema>;
export const pendingChoicesSchema = z
  .union([z.array(z.unknown()), z.object({ choices: z.array(z.unknown()) }).passthrough(), z.object({ items: z.array(z.unknown()) }).passthrough()])
  .transform((v) => (Array.isArray(v) ? v : "choices" in v ? v.choices : v.items))
  .pipe(rowsOf(pendingChoiceSchema));

export const settingsSchema = z.object({ approval_required: z.boolean().catch(false) });
export type SocialSettings = z.infer<typeof settingsSchema>;

// ─── Triggers ────────────────────────────────────────────────────────────

export const triggerSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("on_publish") }),
  z.object({ mode: z.literal("at"), at: z.string() }),
  z.object({ mode: z.literal("before_start"), minutes: z.coerce.number() }),
  z.object({ mode: z.literal("before_reg_close"), minutes: z.coerce.number() }),
  z.object({ mode: z.literal("after_end"), minutes: z.coerce.number() }),
]);
export type Trigger = z.infer<typeof triggerSchema>;
export type TriggerMode = Trigger["mode"];

const lenientTrigger = triggerSchema.catch({ mode: "on_publish" });

// ─── Posts and their targets ─────────────────────────────────────────────

export const POST_STATUSES = ["draft", "needs_approval", "scheduled", "cancelled", "done", "paused"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const TARGET_STATUSES = ["scheduled", "posting", "posted", "failed", "skipped", "cancelled", "held", "waiting_limit"] as const;
export type TargetStatus = (typeof TARGET_STATUSES)[number];

export const FAILURE_ACTIONS = ["retry", "reconnect", "share_manually", "fix_image"] as const;
export type FailureAction = (typeof FAILURE_ACTIONS)[number];

export const targetSchema = z.object({
  id: z.coerce.number(),
  platform: platformField,
  account_id: z.coerce.number().nullish().catch(null),
  text: z.string().catch(""),
  image_url: z.string().nullish().catch(null),
  variant_id: z.coerce.number().nullish().catch(null),
  status: z.enum(TARGET_STATUSES).catch("scheduled"),
  post_url: z.string().nullish().catch(null),
  error: z
    .object({
      code: z.string().nullish().catch(null),
      message: z.string().nullish().catch(null),
      action: z.enum(FAILURE_ACTIONS).nullish().catch(null),
    })
    .nullish()
    .catch(null),
  attempts: z.coerce.number().catch(0),
  posted_at: z.string().nullish().catch(null),
  scheduled_for: z.string().nullish().catch(null),
});
export type PostTarget = z.infer<typeof targetSchema>;

export const postSchema = z.object({
  id: z.coerce.number(),
  name: z.string().catch("Post"),
  trigger: lenientTrigger,
  status: z.enum(POST_STATUSES).catch("draft"),
  /** Why a post is paused (`event_changed`); the contract's posts shape names no field for it, so either spelling. */
  paused_reason: z.string().nullish().catch(null),
  reason: z.string().nullish().catch(null),
  created_by: personSchema,
  approved_by: personSchema,
  targets: rowsOf(targetSchema).catch([]),
});
export type SocialPost = z.infer<typeof postSchema>;

export const eventPostsSchema = z.object({
  attribution: z.record(z.string(), z.coerce.number()).catch({}),
  posts: rowsOf(postSchema).catch([]),
});
export type EventPosts = z.infer<typeof eventPostsSchema>;

// ─── Posters ─────────────────────────────────────────────────────────────

export const POSTER_SIZES = ["ig_portrait", "ig_square", "facebook", "linkedin", "linkedin_square", "x"] as const;
export type PosterSize = (typeof POSTER_SIZES)[number];

/** Each size as the spec's table has it: what it is called and its shape. */
export const POSTER_SIZE: Record<PosterSize, { label: string; width: number; height: number }> = {
  ig_portrait: { label: "Portrait 4:5", width: 1080, height: 1350 },
  ig_square: { label: "Square", width: 1080, height: 1080 },
  facebook: { label: "Landscape 1.9:1", width: 1200, height: 630 },
  linkedin: { label: "Landscape 1.9:1", width: 1200, height: 627 },
  linkedin_square: { label: "Square", width: 1080, height: 1080 },
  x: { label: "Landscape 16:9", width: 1600, height: 900 },
};

/** The sizes each platform may post, its best first. */
export const SIZES_FOR: Record<Platform, PosterSize[]> = {
  instagram: ["ig_portrait", "ig_square"],
  facebook: ["facebook"],
  linkedin: ["linkedin", "linkedin_square"],
  linkedin_page: ["linkedin", "linkedin_square"],
  x: ["x"],
};

export const variantSchema = z.object({
  id: z.coerce.number(),
  size: z.enum(POSTER_SIZES),
  width: z.coerce.number().catch(0),
  height: z.coerce.number().catch(0),
  mode: z.enum(["crop", "fit"]).catch("crop"),
  focus: z.object({ x: z.coerce.number(), y: z.coerce.number() }).nullish().catch(null),
  background: z.string().nullish().catch(null),
  url: z.string().nullish().catch(null),
  /** The club put its own image in this size (absent on the contract's shape: then unknown). */
  custom: z.boolean().nullish().catch(null),
});
export type PosterVariant = z.infer<typeof variantSchema>;
export const variantsSchema = z
  .union([z.array(z.unknown()), z.object({ variants: z.array(z.unknown()) }).passthrough()])
  .transform((v) => (Array.isArray(v) ? v : v.variants))
  .pipe(rowsOf(variantSchema));

// ─── Drafts ──────────────────────────────────────────────────────────────

/**
 * One platform's draft. The contract lists what it holds (the text with its
 * fill-in words, hashtag ideas, the poster variant, the tracking link) but
 * not the field names, so the likely ones are read.
 */
export const draftSchema = z
  .object({
    platform: platformField,
    text: z.string().catch(""),
    hashtags: z.array(z.string()).catch([]).default([]),
    suggested_hashtags: z.array(z.string()).nullish().catch(null),
    variant: variantSchema.nullish().catch(null),
    poster: variantSchema.nullish().catch(null),
    variant_id: z.coerce.number().nullish().catch(null),
    link: z.union([z.string(), z.object({ url: z.string() }).passthrough()]).nullish().catch(null),
    tracking_link: z.union([z.string(), z.object({ url: z.string() }).passthrough()]).nullish().catch(null),
  })
  .transform((d) => {
    const link = d.link ?? d.tracking_link;
    const variant = d.variant ?? d.poster ?? null;
    return {
      platform: d.platform,
      text: d.text,
      hashtags: (d.hashtags.length ? d.hashtags : (d.suggested_hashtags ?? [])).map((h) => h.replace(/^#/, "")).filter(Boolean),
      variant,
      variantId: variant?.id ?? d.variant_id ?? null,
      link: typeof link === "string" ? link : (link?.url ?? null),
    };
  });
export type PlatformDraft = z.infer<typeof draftSchema>;

export const draftsSchema = z
  .union([
    z.array(z.unknown()),
    z.object({ drafts: z.array(z.unknown()) }).passthrough(),
    z.object({ platforms: z.array(z.unknown()) }).passthrough(),
    z.record(z.string(), z.unknown()),
  ])
  .transform((v): unknown[] => {
    if (Array.isArray(v)) return v;
    if ("drafts" in v && Array.isArray(v.drafts)) return v.drafts;
    if ("platforms" in v && Array.isArray(v.platforms)) return v.platforms;
    // Keyed by platform: {instagram: {text, …}, …}
    return Object.entries(v).flatMap(([platform, d]) => (d && typeof d === "object" ? [{ platform, ...(d as object) }] : []));
  })
  .pipe(rowsOf(draftSchema));

// ─── Preview ─────────────────────────────────────────────────────────────

export const previewSchema = z.object({
  text_rendered: z.string().catch(""),
  warnings: z
    .array(z.union([z.object({ code: z.string(), message: z.string().nullish() }).passthrough(), z.string()]))
    .catch([])
    .transform((ws) => ws.map((w) => (typeof w === "string" ? { code: w, message: null } : { code: w.code, message: w.message ?? null }))),
  counts: z.record(z.string(), z.unknown()).nullish().catch(null),
});
export type PostPreview = z.infer<typeof previewSchema>;

export const rewriteSchema = z
  .union([z.string(), z.object({ text: z.string() }), z.object({ rewritten: z.string() })])
  .transform((r): string => (typeof r === "string" ? r : "text" in r ? r.text : r.rewritten));

// ─── Share kit ───────────────────────────────────────────────────────────

export const shareKitSchema = z.object({
  event: z.object({ id: z.coerce.number(), name: z.string(), date: z.string().nullish(), slug: z.string().nullish() }).passthrough().nullish().catch(null),
  platforms: rowsOf(
    z.object({
      platform: platformField,
      text: z.string().catch(""),
      image_url: z.string().nullish().catch(null),
      link: z.string().nullish().catch(null),
    }),
  ).catch([]),
});
export type ShareKit = z.infer<typeof shareKitSchema>;

// ─── Text: fill-in words, counters, warnings ─────────────────────────────

export const FILL_INS = ["event_name", "date", "time", "venue", "fee", "seats_left", "speakers", "link"] as const;
export type FillIn = (typeof FILL_INS)[number];

export const FILL_IN_LABEL: Record<FillIn, string> = {
  event_name: "Event name",
  date: "Date",
  time: "Time",
  venue: "Venue",
  fee: "Fee",
  seats_left: "Seats left",
  speakers: "Speakers",
  link: "Link",
};

/**
 * The words as the dashboard can fill them now. Seats left and speakers are
 * filled on the server at posting time; until it previews, a stand-in of a
 * typical length keeps the counters honest.
 */
export function fillIn(text: string, values: Partial<Record<FillIn, string | null | undefined>>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => {
    if (!(FILL_INS as readonly string[]).includes(key)) return whole;
    const v = values[key as FillIn];
    return v == null || v === "" ? whole : v;
  });
}

/** Characters and the limit each platform sets (spec: "Platform by platform"). */
export const TEXT_LIMIT: Record<Platform, number> = {
  instagram: 2200,
  facebook: 63_206,
  linkedin: 3000,
  linkedin_page: 3000,
  x: 280,
};
export const IG_MAX_HASHTAGS = 30;
/** X counts every link as 23 characters, whatever its length. */
export const X_LINK_LENGTH = 23;

const URL_RE = /\bhttps?:\/\/[^\s]+/gi;
const HAS_URL = /\bhttps?:\/\/\S+/i;
const HASHTAG_RE = /(^|\s)#[\p{L}\p{N}_]+/gu;

export function countHashtags(text: string): number {
  return (text.match(HASHTAG_RE) ?? []).length;
}

/** Characters as the platform counts them: code points, and links as 23 on X. */
export function countChars(platform: Platform, text: string): number {
  const counted = platform === "x" ? text.replace(URL_RE, "x".repeat(X_LINK_LENGTH)) : text;
  return [...counted].length;
}

export interface TextStats {
  chars: number;
  limit: number;
  hashtags: number;
  over: boolean;
}

export function textStats(platform: Platform, rendered: string): TextStats {
  const chars = countChars(platform, rendered);
  return { chars, limit: TEXT_LIMIT[platform], hashtags: countHashtags(rendered), over: chars > TEXT_LIMIT[platform] };
}

export interface TextWarning {
  code: string;
  message: string;
  /** A one-click fix: the text it would become. */
  fix?: { label: string; apply: (text: string) => string };
}

/** What the server's warning codes mean, in the club's words. */
export const WARNING_TEXT: Record<string, string> = {
  x_over_280: "Over X's 280 characters. X counts every link as 23.",
  ig_hashtags_over_30: "Instagram allows at most 30 hashtags.",
  ig_link_not_clickable: "Links in Instagram captions can't be tapped. Say “link in bio” instead.",
  image_shape: "This image's shape doesn't suit the platform. Pick another size or fit it.",
  ig_over_2200: "Over Instagram's 2,200 characters.",
  linkedin_over_3000: "Over LinkedIn's 3,000 characters.",
  empty_text: "Write something to post.",
};

const linkInBio = (text: string) => text.replace(/\{link\}/g, "link in bio").replace(URL_RE, "link in bio");

/** The warnings the dashboard can tell without asking: under the box as the club types. */
export function localWarnings(platform: Platform, template: string, rendered: string): TextWarning[] {
  const out: TextWarning[] = [];
  const stats = textStats(platform, rendered);
  if (!template.trim()) out.push({ code: "empty_text", message: WARNING_TEXT.empty_text! });
  if (platform === "x" && stats.over) out.push({ code: "x_over_280", message: `${stats.chars - stats.limit} over X's 280 characters. X counts every link as 23.` });
  if (platform === "instagram" && stats.over) out.push({ code: "ig_over_2200", message: WARNING_TEXT.ig_over_2200! });
  if ((platform === "linkedin" || platform === "linkedin_page") && stats.over) out.push({ code: "linkedin_over_3000", message: WARNING_TEXT.linkedin_over_3000! });
  if (platform === "instagram" && stats.hashtags > IG_MAX_HASHTAGS)
    out.push({ code: "ig_hashtags_over_30", message: `${stats.hashtags} hashtags: Instagram allows at most ${IG_MAX_HASHTAGS}.` });
  if (platform === "instagram" && (/\{link\}/.test(template) || HAS_URL.test(template))) {
    out.push({ code: "ig_link_not_clickable", message: WARNING_TEXT.ig_link_not_clickable!, fix: { label: "Use “link in bio”", apply: linkInBio } });
  }
  return out;
}

/** The local warnings and the server's, once each. The local one wins: it carries the fix. */
export function mergeWarnings(local: TextWarning[], server: PostPreview["warnings"] | undefined): TextWarning[] {
  const seen = new Set(local.map((w) => w.code));
  const extra = (server ?? []).filter((w) => !seen.has(w.code)).map((w) => ({ code: w.code, message: WARNING_TEXT[w.code] ?? w.message ?? w.code.replace(/_/g, " ") }));
  return [...local, ...extra];
}

/** Where each platform cuts a post with "… more" on a phone (characters, roughly). */
export const CUT_AT: Record<Platform, number> = {
  instagram: 125,
  facebook: 280,
  linkedin: 210,
  linkedin_page: 210,
  x: 280,
};

export function truncateFor(platform: Platform, text: string): { shown: string; cut: boolean } {
  const chars = [...text];
  const at = CUT_AT[platform];
  if (chars.length <= at) return { shown: text, cut: false };
  // Cut on a space where there is one close by, as the apps do.
  const head = chars.slice(0, at).join("");
  const space = head.lastIndexOf(" ");
  return { shown: (space > at - 30 ? head.slice(0, space) : head).trimEnd(), cut: true };
}

// ─── Triggers in words, and when they land ───────────────────────────────

const HOUR = 60;
const DAY = 24 * HOUR;
export const IST_OFFSET_MINUTES = 330;

/** "2 days", "3 hours", "90 minutes", "1 day 6 hours". */
export function minutesLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (m === 0) return "0 minutes";
  if (m % DAY === 0) return plural(m / DAY, "day");
  if (m % HOUR === 0) return plural(m / HOUR, "hour");
  if (m > DAY) return `${plural(Math.floor(m / DAY), "day")} ${plural(Math.round((m % DAY) / HOUR), "hour")}`;
  return plural(m, "minute");
}

const IST_DATE_TIME = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** "Sat 15 Nov, 10:00 am" in India's time. */
export function istLabel(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "--" : IST_DATE_TIME.format(date).replace(/,(?=[^,]*$)/, " ·");
}

export function triggerLabel(t: Trigger): string {
  switch (t.mode) {
    case "on_publish":
      return "On publish";
    case "at":
      return istLabel(t.at);
    case "before_start":
      return `${minutesLabel(t.minutes)} before`;
    case "before_reg_close":
      return `${minutesLabel(t.minutes)} before registrations close`;
    case "after_end":
      return `${minutesLabel(t.minutes)} after the event`;
  }
}

/** The event's times a relative trigger counts from. */
export interface EventClock {
  start?: string | null;
  /** Minutes the event runs; none: a point in time. */
  duration?: number | null;
  regClose?: string | null;
  status?: string | null;
}

/**
 * Quiet hours (contract): a relative time between 23:00 and 07:00 IST moves
 * to 07:00 IST the same morning (the next one, from 23:xx).
 */
export function outOfQuietHours(d: Date): Date {
  const ist = new Date(d.getTime() + IST_OFFSET_MINUTES * 60_000);
  const h = ist.getUTCHours();
  if (h >= 7 && h < 23) return d;
  const morning = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + (h >= 23 ? 1 : 0), 7, 0, 0));
  return new Date(morning.getTime() - IST_OFFSET_MINUTES * 60_000);
}

/**
 * When the trigger lands, as far as the dashboard can tell: null for "on
 * publish" on a draft (it waits for the publish) and for a relative one
 * whose anchor the event has not set.
 */
export function triggerTime(t: Trigger, e: EventClock, now: Date = new Date()): { at: Date | null; moved: boolean } {
  const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : Number.NaN);
  let at: Date | null = null;
  switch (t.mode) {
    case "on_publish":
      return { at: e.status && e.status !== "draft" ? now : null, moved: false };
    case "at":
      at = new Date(t.at);
      return { at: Number.isNaN(at.getTime()) ? null : at, moved: false };
    case "before_start": {
      const s = ms(e.start);
      at = Number.isNaN(s) ? null : new Date(s - t.minutes * 60_000);
      break;
    }
    case "before_reg_close": {
      const c = ms(e.regClose);
      at = Number.isNaN(c) ? null : new Date(c - t.minutes * 60_000);
      break;
    }
    case "after_end": {
      const s = ms(e.start);
      at = Number.isNaN(s) ? null : new Date(s + ((e.duration ?? 0) + t.minutes) * 60_000);
      break;
    }
  }
  if (!at) return { at: null, moved: false };
  const shifted = outOfQuietHours(at);
  return { at: shifted, moved: shifted.getTime() !== at.getTime() };
}

/** The ready-made posts of a campaign (spec: "A campaign per event"). */
export const POST_TEMPLATES = [
  { key: "announcement", name: "Announcement", trigger: { mode: "on_publish" } as Trigger, hint: "When the event is published" },
  { key: "reminder", name: "Reminder", trigger: { mode: "before_start", minutes: 2 * DAY } as Trigger, hint: "2 days before" },
  { key: "last_call", name: "Last call", trigger: { mode: "before_start", minutes: 3 * HOUR } as Trigger, hint: "The morning of, 3 hours before" },
  { key: "thanks", name: "Thank you", trigger: { mode: "after_end", minutes: DAY } as Trigger, hint: "A day after the event" },
] as const;
export type PostTemplateKey = (typeof POST_TEMPLATES)[number]["key"] | "custom";

/** The relative amounts the picker offers, in minutes. */
export const RELATIVE_PRESETS: Record<"before_start" | "before_reg_close" | "after_end", number[]> = {
  before_start: [7 * DAY, 3 * DAY, 2 * DAY, DAY, 3 * HOUR, HOUR],
  before_reg_close: [2 * DAY, DAY, 6 * HOUR, 2 * HOUR],
  after_end: [2 * HOUR, DAY, 2 * DAY],
};

// ─── Status: posts, targets and accounts in words ────────────────────────

export type ChipTone = "default" | "success" | "warning" | "destructive" | "info";

export interface TargetChip {
  label: string;
  tone: ChipTone;
  /** A sentence under the chip: the reason, or what is being waited on. */
  detail: string | null;
  /** What can be done about it, first the most useful. */
  actions: FailureAction[];
}

/**
 * One platform's status on one post, as the Promote tab shows it. A post
 * that is not yet sending (draft, waiting for approval, paused, cancelled)
 * speaks for all its targets; once it is, each target speaks for itself.
 */
export function targetChip(post: Pick<SocialPost, "status">, t: PostTarget, platformName = PLATFORM_LABEL[t.platform]): TargetChip {
  switch (post.status) {
    case "draft":
      return { label: "Draft", tone: "default", detail: null, actions: [] };
    case "needs_approval":
      return { label: "Needs approval", tone: "warning", detail: null, actions: [] };
    case "paused":
      if (t.status === "posted") break;
      return { label: "Paused", tone: "warning", detail: null, actions: ["share_manually"] };
    case "cancelled":
      if (t.status === "posted") break;
      return { label: "Cancelled", tone: "default", detail: null, actions: [] };
    default:
      break;
  }
  switch (t.status) {
    case "scheduled":
      return { label: "Scheduled", tone: "info", detail: t.scheduled_for ? `Goes out ${istLabel(t.scheduled_for)}` : null, actions: [] };
    case "posting":
      return { label: "Posting", tone: "info", detail: null, actions: [] };
    case "posted":
      return { label: "Posted", tone: "success", detail: t.posted_at ? istLabel(t.posted_at) : null, actions: [] };
    case "held":
      return { label: "Held", tone: "warning", detail: `Reconnect ${platformName} to send`, actions: ["reconnect", "share_manually"] };
    case "waiting_limit":
      return { label: "Waiting", tone: "warning", detail: t.platform === "instagram" ? "Waiting for Instagram's daily limit. It goes out by itself." : `Waiting for ${platformName}'s limit. It goes out by itself.`, actions: [] };
    case "skipped":
      return { label: "Skipped", tone: "default", detail: t.error?.message ?? null, actions: [] };
    case "cancelled":
      return { label: "Cancelled", tone: "default", detail: null, actions: [] };
    case "failed": {
      const action = t.error?.action ?? "retry";
      const actions: FailureAction[] = [action, ...(action === "share_manually" ? [] : (["share_manually"] as FailureAction[]))];
      const after = t.attempts > 1 ? ` (after ${t.attempts} tries)` : "";
      return { label: "Failed", tone: "destructive", detail: `${t.error?.message?.trim() || `${platformName} refused the post`}${after}`, actions };
    }
  }
}

export const POST_STATUS_LABEL: Record<PostStatus, { label: string; tone: ChipTone }> = {
  draft: { label: "Draft", tone: "default" },
  needs_approval: { label: "Needs approval", tone: "warning" },
  scheduled: { label: "Scheduled", tone: "info" },
  cancelled: { label: "Cancelled", tone: "default" },
  done: { label: "Done", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
};

/** A post can still be changed: it hasn't gone out, and isn't cancelled. */
export const editable = (p: Pick<SocialPost, "status">) => p.status === "draft" || p.status === "scheduled" || p.status === "needs_approval" || p.status === "paused";
/** A post with targets still waiting can be cancelled. */
export const cancellable = (p: Pick<SocialPost, "status">) => p.status === "scheduled" || p.status === "needs_approval" || p.status === "paused";

const DAY_MS = 86_400_000;

/** Days until an account's access ends (ceil), or null when it does not expire. */
export function daysLeft(expiresAt: string | null | undefined, now: Date = new Date()): number | null {
  if (!expiresAt) return null;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now.getTime()) / DAY_MS);
}

/** The warning window before an expiry (contract: warn 7 days before). */
export const EXPIRY_WARN_DAYS = 7;

export type CardState =
  | { kind: "not_configured" }
  | { kind: "review_pending" }
  | { kind: "plan"; feature: string | null }
  | { kind: "connect" }
  | { kind: "connected"; accounts: SocialAccount[] };

/** What a platform's card says, from the platform row and the club's accounts on it. */
export function cardState(row: PlatformRow, accounts: SocialAccount[]): CardState {
  const mine = accounts.filter((a) => a.platform === row.platform && a.status !== "disconnected");
  // An account already connected stays visible (and disconnectable) even when the plan or the settings changed.
  if (mine.length) return { kind: "connected", accounts: mine };
  if (row.available) return { kind: "connect" };
  if (row.reason === "plan") return { kind: "plan", feature: row.plan_feature ?? null };
  if (row.reason === "review_pending") return { kind: "review_pending" };
  return { kind: "not_configured" };
}

/** Accounts a post can go to now: connected (or waiting to be reconnected: its posts are held, not lost). */
export const postable = (accounts: SocialAccount[]) => accounts.filter((a) => a.status === "connected" || a.status === "needs_reconnect");

// ─── Coming back from a platform ─────────────────────────────────────────

export type ConnectReturn =
  | { kind: "connected"; platform: Platform | null }
  | { kind: "pick"; stateId: string; platform: Platform | null }
  | { kind: "error"; reason: string | null; platform: Platform | null };

/**
 * What the platform's sign-in sent the club back with (contract: the
 * callback 302s to `return_to?social=connected|error&reason=…`). A Facebook
 * or Instagram sign-in with several Pages carries the pending choice's id;
 * the contract does not name its parameter, so the likely names are read.
 */
export function readConnectReturn(params: URLSearchParams): ConnectReturn | null {
  const social = params.get("social");
  if (!social) return null;
  const p = params.get("platform");
  const platform = isPlatform(p) ? p : null;
  const stateId = params.get("pending") ?? params.get("state_id") ?? params.get("pending_id") ?? params.get("state");
  if ((social === "pick" || social === "pending" || social === "connected") && stateId) return { kind: "pick", stateId, platform };
  if (social === "connected") return { kind: "connected", platform };
  if (social === "error") return { kind: "error", reason: params.get("reason"), platform };
  return null;
}

/** A refusal on the way back, in words (the codes are the backend's; an unknown one is said as it is). */
export function connectErrorText(reason: string | null, platform: Platform | null): string {
  const name = platform ? PLATFORM_LABEL[platform] : "the platform";
  switch (reason) {
    case null:
    case "":
      return `${platform ? name : "The account"} didn't connect. Try again.`;
    case "denied":
    case "access_denied":
    case "cancelled":
      return `You didn't allow MyOtherApp on ${name}, so nothing was connected.`;
    case "not_admin":
    case "not_page_admin":
      return "Only a Page admin can post as the Page. Ask the Page's admin to connect it.";
    case "no_pages":
      return "No Facebook Page came back from that sign-in. Pick at least one Page when Facebook asks.";
    case "personal_account":
    case "not_business":
      return "That Instagram account is personal. Switch it to a free Business or Creator account in Instagram's settings, then connect again.";
    case "expired":
    case "state":
    case "invalid_state":
      return "The connect link expired. Start again from here.";
    case "not_configured":
      return `${name} isn't set up on MyOtherApp yet.`;
    case "plan":
      return `Automatic posting to ${name} isn't on your plan.`;
    default:
      return `${name} didn't connect: ${reason.replace(/_/g, " ")}.`;
  }
}

// ─── Posters: the crop window, and whether an image suits a platform ─────

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * The part of the poster a crop keeps, centred on the focus point and kept
 * inside the poster: its box as fractions of the poster, and the matching
 * CSS object-position (0..1) to show the same crop with `object-fit: cover`.
 */
export function cropWindow(posterAspect: number, targetAspect: number, focus: { x: number; y: number }) {
  const fx = clamp01(focus.x);
  const fy = clamp01(focus.y);
  if (!(posterAspect > 0) || !(targetAspect > 0)) return { left: 0, top: 0, width: 1, height: 1, position: { x: 0.5, y: 0.5 } };
  if (targetAspect < posterAspect) {
    // Narrower than the poster: the full height, part of the width.
    const width = targetAspect / posterAspect;
    const left = Math.min(1 - width, Math.max(0, fx - width / 2));
    return { left, top: 0, width, height: 1, position: { x: width < 1 ? left / (1 - width) : 0.5, y: 0.5 } };
  }
  const height = posterAspect / targetAspect;
  const top = Math.min(1 - height, Math.max(0, fy - height / 2));
  return { left: 0, top, width: 1, height, position: { x: 0.5, y: height < 1 ? top / (1 - height) : 0.5 } };
}

/** Width over height each platform accepts for a feed image (Instagram's is the strict one). */
export const SHAPE_RANGE: Record<Platform, [number, number]> = {
  instagram: [0.8, 1.91],
  facebook: [0.5, 3],
  linkedin: [0.4, 3],
  linkedin_page: [0.4, 3],
  x: [0.4, 3],
};

export const OWN_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Why an image the club picked would be refused by the platform, or null when it suits. */
export function imageProblem(platform: Platform, file: { type: string; width: number; height: number }): string | null {
  if (!(OWN_IMAGE_TYPES as readonly string[]).includes(file.type)) return "Use a JPG, PNG or WebP image.";
  if (!(file.width > 0 && file.height > 0)) return "That image couldn't be read.";
  if (file.width < 600 || file.height < 300) return `It's ${file.width} × ${file.height}: too small to look sharp. Use one at least 1080 pixels wide.`;
  const ratio = file.width / file.height;
  const [lo, hi] = SHAPE_RANGE[platform];
  if (ratio < lo || ratio > hi)
    return platform === "instagram" ? "Instagram needs a 4:5, square or landscape image (up to 1.91:1)." : `${PLATFORM_LABEL[platform]} can't post an image that ${ratio < lo ? "tall" : "wide"}.`;
  return null;
}
