import { z } from "zod";

/** The live room, as the console sees it. Field names are the API's. */

// --- notifying the room ----------------------------------------------------------------------

/** What a quiz start, a poll launch or Q&A opening says about the push to checked-in phones. */
export const notifiedSchema = z.object({
  sent: z.number(),
  /** `already_sent`: Q&A opening is told once per event, and it was. */
  skipped_reason: z.enum(["rate_limited", "nobody_checked_in", "all_muted", "disabled", "already_sent"]).nullish(),
  /** Whole seconds until the room can be notified again; sent with `rate_limited`. */
  retry_after: z.number().nullish(),
  /** When the room was last notified; sent with `rate_limited`, for "sent 2 min ago, wait 1 min". */
  last_sent_at: z.string().nullish(),
});
export type Notified = z.infer<typeof notifiedSchema>;

/**
 * The server's rate limit on telling the room, said in the console so a host
 * is never left wondering why a push was skipped (app/api/live/notify.py:
 * LIVE_NOTIFY_GAP_SECONDS and LIVE_NOTIFY_PER_DAY).
 */
export const NOTIFY_GAP_SECONDS = 180;
export const NOTIFY_PER_DAY = 10;
export const NOTIFY_RULE = "One push to the room every 3 minutes, 10 a day for this event.";

/*
 * Optional: a server from before notifying the room sends none. And the quiz
 * or poll has already gone through by the time this is read, so a shape this
 * console does not know reads as no answer rather than failing the action.
 */
const notifiedField = notifiedSchema.nullish().catch(null);

// --- quiz ----------------------------------------------------------------------

export const quizOptionSchema = z.object({ key: z.string(), label: z.string() });

export const quizQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  options: z.array(quizOptionSchema),
  correct_key: z.string().nullish(),
  seconds: z.number(),
  sort_order: z.number(),
});
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

export const quizSchema = z.object({
  id: z.string(),
  title: z.string(),
  intro: z.string().nullish(),
  status: z.enum(["draft", "live", "ended"]),
  join_code: z.string().nullish(),
  current_index: z.number(),
  players: z.number(),
  questions: z.array(quizQuestionSchema),
});
export type Quiz = z.infer<typeof quizSchema>;

export const tallySchema = z.object({ key: z.string(), label: z.string(), count: z.number(), correct: z.boolean() });

export const hostStateSchema = z.object({
  status: z.enum(["draft", "live", "ended"]),
  join_code: z.string().nullish(),
  title: z.string(),
  players: z.number(),
  current_index: z.number(),
  total: z.number(),
  question: z
    .object({ id: z.string(), prompt: z.string(), options: z.array(quizOptionSchema), correct_key: z.string().nullish(), seconds: z.number(), time_left: z.number(), answered: z.number(), counts: z.array(tallySchema) })
    .nullish(),
  leaderboard: z.array(z.object({ rank: z.number(), name: z.string(), score: z.number() })),
});

export type HostAction = "start" | "next" | "end" | "reset";

/** The host state a start · next · end · reset returns; a start also says who was notified. */
export const hostActionSchema = hostStateSchema.extend({ notified: notifiedField });

export const SECONDS = [10, 20, 30, 60] as const;
export const OPTION_KEYS = ["a", "b", "c", "d", "e", "f"] as const;

// --- Q&A ----------------------------------------------------------------------

export const questionSchema = z.object({
  id: z.string(),
  text: z.string(),
  author_name: z.string().nullish(),
  status: z.enum(["pending", "approved", "answered", "rejected"]),
  pinned: z.boolean(),
  votes: z.number(),
  created_at: z.string(),
  answered_at: z.string().nullish(),
});
export type Question = z.infer<typeof questionSchema>;

export const qaBoardSchema = z.object({
  approve_first: z.boolean(),
  to_review: z.array(questionSchema),
  board: z.array(questionSchema),
  answered: z.array(questionSchema),
  rejected: z.number(),
});
export type ModerateAction = "approve" | "reject" | "answered" | "reopen" | "pin" | "unpin";

/** A moderated question; an approve or a pin also says whether the room was told Q&A is open. */
export const moderateSchema = questionSchema.extend({ notified: notifiedField });
/** The board after switching approval; switching it off also says whether the room was told. */
export const qaSettingsSchema = qaBoardSchema.extend({ notified: notifiedField });

// --- polls ----------------------------------------------------------------------

export const pollResultsSchema = z.object({
  responses: z.number(),
  choices: z.array(z.object({ label: z.string(), count: z.number(), pct: z.number() })).optional(),
  words: z.array(z.object({ word: z.string(), count: z.number() })).optional(),
  rating: z.object({ average: z.number().nullable(), histogram: z.array(z.object({ value: z.number(), count: z.number(), pct: z.number() })) }).optional(),
});

export const pollSchema = z.object({
  id: z.string(),
  kind: z.enum(["choice", "words", "rating"]),
  prompt: z.string(),
  options: z.array(z.string()),
  status: z.enum(["draft", "live", "closed"]),
  launched_at: z.string().nullish(),
  closed_at: z.string().nullish(),
  sort_order: z.number(),
  results: pollResultsSchema,
  my_response: z.string().nullish(),
});
export type Poll = z.infer<typeof pollSchema>;

/** The poll a launch or close returns; a launch also says who was notified. */
export const pollStatusSchema = pollSchema.extend({ notified: notifiedField });

export const POLL_KINDS = [
  { value: "choice", label: "Multiple choice", hint: "Pick one of your answers" },
  { value: "words", label: "Word cloud", hint: "A word or two from everyone" },
  { value: "rating", label: "Rating 1–5", hint: "Stars for a talk or a demo" },
] as const;

// --- feedback ----------------------------------------------------------------------

export const surveyQuestionSchema = z.object({ key: z.string(), kind: z.enum(["rating", "nps", "text"]), label: z.string() });
export type SurveyQuestion = z.infer<typeof surveyQuestionSchema>;

export const resultsSchema = z.object({
  responses: z.number(),
  invited: z.number(),
  nps: z.object({ score: z.number(), promoters: z.number(), passives: z.number(), detractors: z.number(), count: z.number() }).nullable(),
  averages: z.array(z.object({ key: z.string(), label: z.string(), average: z.number().nullable(), count: z.number() })),
  texts: z.array(z.string()),
});
export type SurveyResults = z.infer<typeof resultsSchema>;

export const feedbackSchema = z.object({
  auto_send: z.boolean(),
  delay_minutes: z.number(),
  questions: z.array(surveyQuestionSchema),
  sent_at: z.string().nullish(),
  sent_count: z.number(),
  sends_at: z.string().nullish(),
  results: resultsSchema,
  previous: resultsSchema.extend({ event_id: z.number(), event_name: z.string() }).nullish(),
  checked_in: z.number(),
});
export type Feedback = z.infer<typeof feedbackSchema>;

export const surveySchema = feedbackSchema.pick({ auto_send: true, delay_minutes: true, questions: true, sent_at: true, sent_count: true });

export const DELAYS = [
  { value: 30, label: "30 minutes after the event ends" },
  { value: 60, label: "1 hour after the event ends" },
  { value: 180, label: "3 hours after the event ends" },
  { value: 1440, label: "The next day" },
] as const;

export const KIND_LABEL: Record<SurveyQuestion["kind"], string> = { rating: "Rating", nps: "0–10", text: "Text" };

// --- updates ----------------------------------------------------------------------

export const updateSchema = z.object({
  id: z.string(),
  kind: z.enum(["schedule", "room", "general"]),
  text: z.string(),
  audience: z.enum(["checked_in", "registered"]),
  recipients: z.number(),
  pushed: z.number(),
  sent_at: z.string(),
});
export type LiveUpdate = z.infer<typeof updateSchema>;

export const updatesPageSchema = z.object({ audience: z.object({ registered: z.number(), checked_in: z.number() }), items: z.array(updateSchema) });

export const UPDATE_KINDS = [
  { value: "schedule", label: "Schedule change", placeholder: "e.g. Demos start at 9:40 — ten minutes late" },
  { value: "room", label: "Room change", placeholder: "e.g. Demos move to Lab 3B — same time" },
  { value: "general", label: "General", placeholder: "e.g. Wi-Fi: CS-HackNight · password edge2026" },
] as const;

export const AUDIENCE_LABEL = { checked_in: "Checked-in attendees", registered: "Everyone registered" } as const;

export const shiftOutSchema = z.object({ update: updateSchema, items: z.array(z.object({ id: z.string(), title: z.string(), starts_at: z.string(), ends_at: z.string().nullish() })) });

// --- the screen ----------------------------------------------------------------------

export const screenSchema = z.object({
  event: z.object({ id: z.number(), name: z.string() }),
  pinned: questionSchema.nullish(),
  board: z.array(questionSchema),
  poll: pollSchema.nullish(),
  quiz: hostStateSchema.nullish(),
  update: updateSchema.nullish(),
});
export type Screen = z.infer<typeof screenSchema>;
