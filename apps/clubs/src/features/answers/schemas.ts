import { ApiError } from "@moa/api";
import { z } from "zod";

/**
 * Missing answers (feature-register/missing-answers-contract.md): a club
 * changes the sign-up questions of an event people already signed up for;
 * the platform keeps every answer given, works out who is missing what, and
 * lets the club ask exactly those people for exactly those answers.
 *
 * A *person* is a confirmed registration or an open registration request
 * (pending or confirmed but unpaid). A question is *missing* for someone
 * when it must be answered, applies to them, and is blank or no longer valid
 * (a choice that isn't an option any more); it is *askable* when it is blank
 * or invalid, required or not. A *ref* names one person in a payload: the
 * registration's uuid, or "q" and the request's uuid. The dashboard only
 * ever builds one and passes it back (registrationRef, requestRef).
 */

const count = z.coerce
  .number()
  .catch(0)
  .transform((n) => (Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0));
const label = z.string().nullish().transform((v) => v ?? null);

export const peopleSchema = z
  .object({ registrations: count, requests: count })
  .catch({ registrations: 0, requests: 0 });
export type People = z.infer<typeof peopleSchema>;
export const peopleTotal = (p: People | null | undefined) => (p ? p.registrations + p.requests : 0);

// ─── §1.3 What saving a changed form would do ───────────────────────────

const list = <T extends z.ZodTypeAny>(item: T) => z.array(item).catch([]);

export const formImpactSchema = z.object({
  people: peopleSchema,
  added: list(z.object({ key: z.string(), label, required: z.boolean().catch(false), askable: count })),
  removed: list(z.object({ key: z.string(), label, answered: count })),
  now_required: list(z.object({ key: z.string(), label, missing: count })),
  options_removed: list(z.object({ key: z.string(), label, option: z.string(), chosen_by: count })),
  relabelled: list(z.object({ key: z.string(), from: label, to: label })),
  type_changed: list(z.object({ key: z.string(), label, from: z.string().catch(""), to: z.string().catch(""), invalid_after: count })),
});
export type FormImpact = z.infer<typeof formImpactSchema>;

/** Whether the impact has anything to tell the club before saving. */
export function impactHasNews(i: FormImpact): boolean {
  return [i.added, i.removed, i.now_required, i.options_removed, i.relabelled, i.type_changed].some((l) => l.length > 0);
}

/**
 * What saving would leave to ask for: the questions added and those now
 * required, preselected in the Ask panel, and how many people that is at
 * most (one person can be counted under two questions).
 */
export function impactToAsk(i: FormImpact): { keys: string[]; people: number } {
  const keys = [...new Set([...i.added.map((q) => q.key), ...i.now_required.map((q) => q.key)])];
  const people = Math.max(0, ...i.added.map((q) => q.askable), ...i.now_required.map((q) => q.missing));
  return { keys, people };
}

// ─── §1.4 Who is missing what ───────────────────────────────────────────

export const summaryQuestionSchema = z.object({
  key: z.string(),
  label,
  required: z.boolean().catch(false),
  answered: count,
  blank: count,
  invalid: count,
  hidden: count,
  missing: count,
});
export type SummaryQuestion = z.infer<typeof summaryQuestionSchema>;

export const answersSummarySchema = z.object({
  people: peopleSchema,
  people_missing: count,
  questions: list(summaryQuestionSchema),
  /** Answers stored under keys the form no longer has (organization excluded). */
  stray: list(z.object({ key: z.string(), count })),
  open_asks: count,
});
export type AnswersSummary = z.infer<typeof answersSummarySchema>;

/** The keys a list row is missing, in form order: `missing_answers` on registrations and requests (§1.4). */
export const missingKeysSchema = z
  .array(z.string())
  .nullish()
  .catch(null)
  .transform((v) => v ?? []);

/** One thing about the answers that wants the club on the event's Overview (§3 item 3), and what pressing it does. */
export interface AnswersAttention {
  kind: string;
  tone: "amber";
  title: string;
  body: string;
  /** Where the item leads when it opens nothing on the page itself. */
  path: string;
  /** "ask": the Ask panel; a stray key: the Move dialog for it; null: only the link. */
  action: "ask" | { move: { key: string; count: number } } | null;
}

const listWords = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
const oldKeyWords = (key: string) => {
  const words = key.replace(/_/g, " ").trim();
  return words ? `${words[0]!.toUpperCase()}${words.slice(1)}` : key;
};

/**
 * What the Overview says about missing answers: who hasn't answered (asking
 * them is for whoever can write to the guests), and, for owners and admins,
 * answers left under a question the form no longer has, to move to the one
 * that replaced it.
 */
export function answersAttention(s: AnswersSummary | null | undefined, can: { ask: boolean; move: boolean }): AnswersAttention[] {
  if (!s) return [];
  const out: AnswersAttention[] = [];
  if (s.people_missing > 0) {
    const most = [...s.questions].filter((q) => q.missing > 0).sort((a, b) => b.missing - a.missing);
    const named = most.slice(0, 2).map((q) => `${q.label?.trim() || q.key} (${num(q.missing)})`);
    const more = most.length - named.length;
    const which = named.length ? `Missing: ${listWords(more > 0 ? [...named, `${more} more`] : named)}.` : "";
    const next = s.open_asks > 0 ? `${s.open_asks === 1 ? "An ask is" : `${num(s.open_asks)} asks are`} open; Messages has the progress.` : can.ask ? "Ask them: one message with a personal link to add just those." : "Someone who can write to the guests can ask them.";
    out.push({
      kind: "ANSWERS_MISSING",
      tone: "amber",
      title: `${peopleWord(s.people_missing)} haven't answered every question`,
      body: [which, next].filter(Boolean).join(" "),
      path: "/attendees?missing=1",
      action: can.ask ? "ask" : null,
    });
  }
  if (can.move) {
    for (const stray of s.stray.filter((x) => x.count > 0).slice(0, 2)) {
      out.push({
        kind: `ANSWERS_STRAY_${stray.key}`,
        tone: "amber",
        title: `Answers under an old question: ${oldKeyWords(stray.key)} (${num(stray.count)})`,
        body: "The form no longer asks it, so these answers count for nothing. Move them to the question that replaced it.",
        path: "/edit#section-questions",
        action: { move: stray },
      });
    }
  }
  return out;
}

/** §1.5 Answers moved from an old key to a current one. */
export const moveResultSchema = z.object({ moved: count, skipped: count });
export type MoveResult = z.infer<typeof moveResultSchema>;

// ─── §2.1 Asks ──────────────────────────────────────────────────────────

export const ASK_CHANNELS = ["push", "email", "whatsapp"] as const;
export type AskChannel = (typeof ASK_CHANNELS)[number];
export const CHANNEL_LABEL: Record<AskChannel, string> = { push: "App notification", email: "Email", whatsapp: "WhatsApp" };
const channelSchema = z.array(z.string()).catch([]).transform((cs) => cs.filter((c): c is AskChannel => (ASK_CHANNELS as readonly string[]).includes(c)));

/** The most questions one ask may carry, the longest message, the most people "Ask again" may name. */
export const ASK_QUESTIONS_MAX = 20;
export const ASK_MESSAGE_MAX = 300;
export const ASK_REFS_MAX = 500;
/** The automatic reminder, when it is on. */
export const REMIND_AFTER_HOURS = 48;
/** Reminders an ask may send (the automatic one counts), and the least gap between two. */
export const REMINDERS_MAX = 2;
export const REMIND_GAP_HOURS = 12;

export const askPreviewSchema = z.object({
  people: count,
  reach: z.object({ push: count, email: count, whatsapp: count }).catch({ push: 0, email: 0, whatsapp: 0 }),
  whatsapp: z
    .object({ available: z.boolean().catch(false), reason: z.string().nullish().transform((v) => v ?? null) })
    .catch({ available: false, reason: null }),
});
export type AskPreview = z.infer<typeof askPreviewSchema>;

export const answerAskSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  created_by: label,
  questions: list(z.object({ key: z.string(), label })),
  channels: channelSchema,
  message: label,
  deadline: label,
  remind_after_hours: z.number().nullish().transform((v) => v ?? null),
  status: z
    .string()
    .catch("open")
    .transform((s): "open" | "closed" => (s === "closed" ? "closed" : "open")),
  counts: z
    .object({ people: count, sent: count, failed: count, opened: count, answered: count, still_askable: count })
    .catch({ people: 0, sent: 0, failed: 0, opened: 0, answered: 0, still_askable: 0 }),
  reminders_sent: count,
  next_reminder_at: label,
});
export type AnswerAsk = z.infer<typeof answerAskSchema>;

export const asksListSchema = z.object({ asks: z.array(answerAskSchema) });

/** What POST …/answers/asks is sent. */
export interface AskBody {
  questions: string[];
  channels: AskChannel[];
  message: string;
  /** ISO with its offset; null for none. */
  deadline: string | null;
  remind_after_hours: number | null;
  include_requests: boolean;
  /** Null: everyone askable. A list: only these people ("Ask again"). */
  refs: string[] | null;
  client_ref: string;
}

export interface AskPreviewBody {
  questions: string[];
  include_requests: boolean;
  refs: string[] | null;
}

// ─── Refs ───────────────────────────────────────────────────────────────

/** A confirmed registration, named in an ask. */
export const registrationRef = (registrationId: string) => registrationId;
/** An open registration request, named in an ask: "q" then its uuid, nothing between. */
export const requestRef = (requestId: string) => `q${requestId}`;

// ─── Words ──────────────────────────────────────────────────────────────

const num = (n: number) => n.toLocaleString("en-IN");
export const peopleWord = (n: number) => `${num(n)} ${n === 1 ? "person" : "people"}`;
export const detailsWord = (n: number) => `${num(n)} more ${n === 1 ? "detail" : "details"}`;

/** Why the club's WhatsApp can't carry an ask (§2.1), in the club's words. */
export const WHATSAPP_REASON: Record<string, string> = {
  NO_FEATURE: "WhatsApp messages aren't on your plan.",
  NOT_CONNECTED: "Connect your club's WhatsApp number first, under WhatsApp → Settings.",
  TEMPLATE_NOT_APPROVED: "Your “details_needed” WhatsApp template isn't approved yet. Submit it under WhatsApp → Templates.",
};
export const whatsappReason = (reason: string | null) => (reason ? (WHATSAPP_REASON[reason] ?? "Your club's WhatsApp can't send this yet.") : "Your club's WhatsApp can't send this yet.");

/** The message the Ask panel starts with: plain text, under the limit. */
export function defaultAskMessage(eventName: string, n: number): string {
  const text = `We need ${detailsWord(n)} for your ${eventName.trim() || "event"} registration. It takes a minute, and your ticket stays as it is.`;
  return text.slice(0, ASK_MESSAGE_MAX);
}

/** A deadline as a `datetime-local` value turned into ISO with this browser's offset, or null. */
export function deadlineToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, "0");
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  return `${local.length === 16 ? `${local}:00` : local}${sign}${pad(offset / 60)}:${pad(offset % 60)}`;
}

/** Why a deadline can't be used, or null: it must be ahead, and not after the event ends. */
export function deadlineProblem(local: string, now: Date, endsAt?: string | null): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return "Pick a day and a time.";
  if (d <= now) return "Pick a time that's still ahead.";
  const end = endsAt ? new Date(endsAt) : null;
  if (end && !Number.isNaN(end.getTime()) && d > end) return "The deadline can't be after the event ends.";
  return null;
}

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
export const deadlineWords = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : DAY.format(d);
};

/** What each channel will say, for the Preview (§2.1): the push, the email and the WhatsApp template. */
export function askPreviewTexts({ eventName, questions, message, deadline, firstName = "Haritha" }: { eventName: string; questions: string[]; message: string; deadline: string | null; firstName?: string }) {
  const n = questions.length;
  const by = deadlineWords(deadline);
  return {
    push: { title: `${eventName} needs ${detailsWord(n)}`, body: message },
    email: {
      subject: `${eventName} needs ${detailsWord(n)} from you`,
      body: message,
      items: questions,
      deadline: by ? `Please add them by ${by}.` : null,
      button: "Add my details",
    },
    whatsapp: {
      body: `Hi ${firstName}, ${eventName} needs ${num(n)} more details for your registration. Please add them by ${by ?? "the event"}.`,
      button: "Add my details",
    },
  };
}

/** An ask's progress in figures: answered as a share of the people it went to. */
export function askProgress(a: AnswerAsk): { answeredPct: number; remindersLeft: number } {
  const answeredPct = a.counts.people ? Math.round((a.counts.answered / a.counts.people) * 100) : 0;
  return { answeredPct, remindersLeft: Math.max(0, REMINDERS_MAX - a.reminders_sent) };
}

/** Seconds as "3 h" / "40 min" / "less than a minute". */
export function waitWords(seconds: number): string {
  if (seconds < 60) return "less than a minute";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} h`;
}

/** `retry_after` from a refusal: in its `errors`, as a number or a one-item list. */
export function retryAfterOf(error: unknown): number | null {
  if (!(error instanceof ApiError) || !error.fieldErrors) return null;
  const raw = (error.fieldErrors as Record<string, unknown>).retry_after;
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A refused reminder, said in words (§2.1: REMIND_LIMIT, REMIND_TOO_SOON). */
export function remindProblem(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.errorCode === "REMIND_LIMIT") return `Both reminders for this ask have gone. Ask again to reach them once more.`;
    if (error.errorCode === "REMIND_TOO_SOON") {
      const wait = retryAfterOf(error);
      return wait ? `The last reminder went less than ${REMIND_GAP_HOURS} hours ago. You can remind them again in ${waitWords(wait)}.` : `The last reminder went less than ${REMIND_GAP_HOURS} hours ago. Try again later.`;
    }
    if (error.message) return error.message;
  }
  return "The reminder didn't go. Try again.";
}

/** A refused ask, said in words (§2.1: NOTHING_TO_ASK, EVENT_ENDED). */
export function askProblem(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.errorCode === "NOTHING_TO_ASK") return "Nobody is missing these answers any more, so there's nobody to ask.";
    if (error.errorCode === "EVENT_ENDED") return "This event has ended, so nobody can be asked for answers any more.";
    if (error.message) return error.message;
  }
  return "The ask didn't go. Try again.";
}
