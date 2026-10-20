import { z } from "zod";
import { ApiError } from "@moa/api";

/**
 * AI assist: a draft event from a poster or a message, words for the
 * editors, a summary of what guests said, and the club's own AI key.
 *
 * The server holds every rule: whether AI is switched on at all
 * (`enabled`, the kill switch), whether the club's plan has it
 * (`plan_allows`, true whenever the club brings its own key), and the
 * month's count. The dashboard only stops offering what it would refuse.
 */

/** The plan flag. Not in the dashboard's gated list until the server sends it; `plan_allows` is what decides. */
export const AI_FEATURE = "ai_assist";

// ─── GET /clubs/ai/status ───────────────────────────────────────────────

export const AI_PROVIDERS = ["gemini", "anthropic"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** The provider as a club says it: "your own Claude key". */
export const PROVIDER_SHORT: Record<AiProvider, string> = { gemini: "Gemini", anthropic: "Claude" };
/** The provider in the select. */
export const PROVIDER_LONG: Record<AiProvider, string> = { gemini: "Google Gemini", anthropic: "Anthropic Claude" };

export const aiStatusSchema = z.object({
  enabled: z.boolean().catch(false),
  plan_allows: z.boolean().catch(false),
  used: z.number().catch(0),
  /** Null for no monthly cap. */
  limit: z.number().nullable().catch(null),
  resets_at: z.string().nullable().catch(null),
  /** The club runs AI on its own key: no quota, its own provider's bill. */
  byok: z.boolean().catch(false),
  provider: z.string().nullable().catch(null),
});
export type AiStatus = z.infer<typeof aiStatusSchema>;

const providerShort = (p: string | null | undefined) => (p && p in PROVIDER_SHORT ? PROVIDER_SHORT[p as AiProvider] : null);

/** "1 Nov": the day the month's count starts again, in India's calendar. */
export function resetDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(d);
}

/** At or over the month's AI actions. Never with the club's own key, never with no cap. */
export function quotaReached(s: AiStatus | null | undefined): boolean {
  return Boolean(s && !s.byok && s.limit !== null && s.used >= s.limit);
}

/**
 * The meter's line: "AI actions: 12 of 150 this month, resets 1 Nov", or
 * "Using your own Claude key" when the club brought one (no count: its
 * provider bills it).
 */
export function usageLine(s: AiStatus): string {
  if (s.byok) return `Using your own ${providerShort(s.provider) ?? "AI"} key`;
  const day = resetDay(s.resets_at);
  if (s.limit === null) return `AI actions: ${s.used.toLocaleString("en-IN")} this month, no monthly limit`;
  return `AI actions: ${s.used.toLocaleString("en-IN")} of ${s.limit.toLocaleString("en-IN")} this month${day ? `, resets ${day}` : ""}`;
}

/** What a 429 says: how many, and when they come back. */
export function quotaText(s: AiStatus | null | undefined): string {
  const day = resetDay(s?.resets_at);
  const all = s?.limit != null ? `all ${s.limit.toLocaleString("en-IN")} AI actions` : "this month's AI actions";
  return `You've used ${all} this month. ${day ? `They reset on ${day}.` : "They reset at the start of next month."}`;
}

// ─── POST /clubs/ai/event-draft ─────────────────────────────────────────

export const DRAFT_TEXT_MAX = 6000;
export const DRAFT_FILE_MAX = 10 * 1024 * 1024;
export const DRAFT_FILE_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"] as const;

/** Why a file cannot be sent, or null when it can. */
export function draftFileProblem(file: File): string | null {
  if (!(DRAFT_FILE_TYPES as readonly string[]).includes(file.type)) return "Use a PNG, JPEG or WebP image, or a PDF.";
  if (file.size > DRAFT_FILE_MAX) return "That file is over 10 MB. Try a smaller image, or a screenshot of the poster.";
  return null;
}

const text = z
  .string()
  .nullish()
  .catch(null)
  .transform((v) => (v && v.trim() ? v.trim() : null));
// Numbers are never coerced: a null fee is "not on the poster", and coercion would make it 0, "free".
const num = z
  .number()
  .nullish()
  .catch(null)
  .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));

export const QUESTION_TYPES = ["text", "select", "radio", "checkbox", "number", "url", "date"] as const;

export const eventDraftSchema = z.object({
  name: text,
  /** ISO with +05:30, or null when the poster gives no date. */
  event_datetime: text,
  duration_hours: num,
  format: z.enum(["in_person", "online"]).nullish().catch(null),
  venue_name: text,
  venue_address: text,
  online_link: text,
  fee: num,
  capacity: num,
  about: text,
  guidelines: text,
  category: text,
  topics: z.array(z.string()).catch([]).default([]),
  interests: z.array(z.string()).catch([]).default([]),
  agenda: z
    .array(z.object({ at: z.string(), title: z.string(), by: text }))
    .catch([])
    .default([]),
  speakers: z
    .array(z.object({ name: z.string(), designation: text, bio: text }))
    .catch([])
    .default([]),
  questions: z
    .array(
      z.object({
        label: z.string(),
        type: z.string().catch("text"),
        options: z.array(z.string()).catch([]).default([]),
        required: z.boolean().catch(true).default(true),
      }),
    )
    .catch([])
    .default([]),
});
export type EventDraft = z.infer<typeof eventDraftSchema>;

export const draftResultSchema = z.object({
  draft: eventDraftSchema,
  warnings: z.array(z.string()).catch([]).default([]),
});
export type DraftResult = z.infer<typeof draftResultSchema>;

// ─── POST /clubs/ai/write ───────────────────────────────────────────────

export const WRITE_KINDS = ["event_description", "announcement", "email", "sponsor_thanks", "social_caption"] as const;
export type WriteKind = (typeof WRITE_KINDS)[number];

export const WRITE_KIND_LABEL: Record<WriteKind, string> = {
  event_description: "Event description",
  announcement: "Announcement",
  email: "Email",
  sponsor_thanks: "Thank-you to a sponsor",
  social_caption: "Social media caption",
};

export const WRITE_KIND_HINT: Record<WriteKind, string> = {
  event_description: "Hands-on Flutter workshop for beginners; bring a laptop; certificates for everyone who finishes",
  announcement: "Venue moved to Hall B, same time; doors open 15 minutes early",
  email: "Remind people the event is tomorrow, what to bring, and that the ticket QR gets them in",
  sponsor_thanks: "Thank Acme Labs for sponsoring the prizes and the snacks",
  social_caption: "Registrations close Friday; 40 seats left; link in bio",
};

export const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ml", label: "Malayalam" },
  { value: "en_ml", label: "Both" },
] as const;
export type Language = (typeof LANGUAGES)[number]["value"];

export const TONES = [
  { value: "friendly", label: "Friendly" },
  { value: "formal", label: "Formal" },
  { value: "hype", label: "Hype" },
] as const;
export type Tone = (typeof TONES)[number]["value"];

export const WRITE_PROMPT_MAX = 2000;

export interface WriteInput {
  kind: WriteKind;
  language: Language;
  tone: Tone;
  prompt: string;
  event_id: number | null;
}

export const writeResultSchema = z.object({
  text: z.string(),
  subject: z
    .string()
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null)),
});
export type WriteResult = z.infer<typeof writeResultSchema>;

/**
 * The prompt with what the page already knows about the event, for an
 * editor with no saved event to point at (a new one). Cut to the limit
 * from the context's end, never the organiser's words.
 */
export function promptWithContext(prompt: string, context?: string | null): string {
  const p = prompt.trim();
  const c = context?.trim();
  if (!c) return p.slice(0, WRITE_PROMPT_MAX);
  const head = p ? `${p}\n\n` : "";
  const room = WRITE_PROMPT_MAX - head.length - "About the event: ".length;
  return room > 20 ? `${head}About the event: ${c.slice(0, room)}` : p.slice(0, WRITE_PROMPT_MAX);
}

// ─── GET /events/{id}/ai/feedback-summary ───────────────────────────────

export const FEEDBACK_MIN_RESPONSES = 5;
export const SENTIMENTS = ["positive", "mixed", "negative"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];
export const SENTIMENT_LABEL: Record<Sentiment, string> = { positive: "Mostly positive", mixed: "Mixed", negative: "Mostly negative" };

const lines = z.array(z.string()).catch([]).default([]);

export const feedbackSummarySchema = z.object({
  summary: z
    .object({
      loved: lines,
      complaints: lines,
      fix_next: lines,
      sentiment: z.enum(SENTIMENTS).catch("mixed"),
      quotes: lines,
    })
    .nullable()
    .catch(null),
  responses: z.number().catch(0),
  generated_at: z.string().nullable().catch(null),
  cached: z.boolean().catch(false),
});
export type FeedbackSummary = z.infer<typeof feedbackSummarySchema>;

// ─── /clubs/ai/key ──────────────────────────────────────────────────────

export const aiKeySchema = z.object({
  connected: z.boolean().catch(false),
  provider: z.enum(AI_PROVIDERS).nullable().catch(null),
  model: z.string().nullable().catch(null),
  key_last4: z.string().nullable().catch(null),
  verified_at: z.string().nullable().catch(null),
  models: z.object({ gemini: z.array(z.string()).catch([]).default([]), anthropic: z.array(z.string()).catch([]).default([]) }).catch({ gemini: [], anthropic: [] }),
});
export type AiKey = z.infer<typeof aiKeySchema>;

export const aiKeyInputSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  api_key: z.string().trim().min(8, "Paste the whole key"),
  model: z.string().min(1, "Pick a model"),
});
export type AiKeyInput = z.infer<typeof aiKeyInputSchema>;

/** Where each provider hands out keys. */
export const KEY_HELP: Record<AiProvider, { where: string; href: string }> = {
  gemini: { where: "Google AI Studio", href: "https://aistudio.google.com/apikey" },
  anthropic: { where: "the Claude Console", href: "https://console.anthropic.com/settings/keys" },
};

/** Where the key is kept in the dashboard; every "update your key" points here. */
export const AI_KEY_PATH = "/payments#ai-key";

// ─── What the server says no with ───────────────────────────────────────

export const AI_DISABLED = "AI_DISABLED";
export const AI_QUOTA_REACHED = "AI_QUOTA_REACHED";
export const AI_UNAVAILABLE = "AI_UNAVAILABLE";
export const AI_KEY_INVALID = "AI_KEY_INVALID";
export const AI_KEY_QUOTA = "AI_KEY_QUOTA";

export interface AiProblem {
  text: string;
  /** Point at the club's key: it was rejected or is out of credit. */
  keyLink: boolean;
  /** The month's count is spent, so trying again will not help. */
  quota: boolean;
  /** The plan said no: the upgrade dialog answers it (PlanLockHost). */
  plan: boolean;
}

const problem = (text: string, extra: Partial<AiProblem> = {}): AiProblem => ({ text, keyLink: false, quota: false, plan: false, ...extra });

/** Any AI action's refusal, in the club's words. */
export function aiProblem(error: unknown, status?: AiStatus | null): AiProblem {
  if (!(error instanceof ApiError)) {
    if (error instanceof Error && error.name === "AbortError") return problem("Stopped.");
    return problem("That didn't go through. Check your connection and try again.");
  }
  switch (error.errorCode) {
    case AI_QUOTA_REACHED:
      return problem(quotaText(status), { quota: true });
    case AI_UNAVAILABLE:
      return problem("AI is busy, try again in a minute.");
    case AI_DISABLED:
      return problem("AI assist is switched off for now.");
    case AI_KEY_INVALID:
      return problem("Your AI key was rejected. Update it under Payments → Your own AI key.", { keyLink: true });
    case AI_KEY_QUOTA:
      return problem("Your AI provider says your key is out of credit. Add credit with them, or remove the key to use your plan's AI actions.", { keyLink: true });
    case "PLAN_FEATURE_LOCKED":
    case "PLAN_LIMIT_REACHED":
      return problem("AI assist isn't on your plan.", { plan: true });
  }
  if (error.status === 429) return problem(quotaText(status), { quota: true });
  if (error.status === 503) return problem("AI is busy, try again in a minute.");
  if (error.status === 413) return problem("That file is too big to send. Try a smaller image, or a screenshot of the poster.");
  if (error.status === 422)
    return problem(error.message && error.message !== "Some of the submitted values were not valid." ? error.message : "AI couldn't use what was sent. Change it and try again.");
  return problem(error.message || "Something went wrong. Try again.");
}

/** A refusal that changes what the status says: the count, the switch, the key. */
export function touchesStatus(error: unknown): boolean {
  return error instanceof ApiError && [AI_QUOTA_REACHED, AI_DISABLED, AI_KEY_INVALID, AI_KEY_QUOTA].includes(error.errorCode ?? "");
}
