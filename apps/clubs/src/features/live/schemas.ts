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

// --- pictures ----------------------------------------------------------------------

/** A picture uploaded for the live room (a logo, a background, a poll option), in three sizes. */
export const mediaSchema = z.object({
  /** null for the club's own logo, which the `club` preset borrows. */
  id: z.string().nullish(),
  kind: z.string().nullish(),
  thumbnail: z.string().nullish(),
  medium: z.string().nullish(),
  large: z.string().nullish(),
  original: z.string().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
});
export type Media = z.infer<typeof mediaSchema>;

// --- quiz ----------------------------------------------------------------------

export const quizOptionSchema = z.object({ key: z.string(), label: z.string() });
export type QuizOption = z.infer<typeof quizOptionSchema>;

/** What a question asks for. A question with no kind (every one written before rounds) is `single`. */
export const QUESTION_KINDS = ["single", "multi", "true_false", "type", "order", "poll"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];
/** A kind this console does not know reads as a single answer: its options still show. */
const kindField = z.enum(QUESTION_KINDS).nullish().catch("single");

export const quizQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  options: z.array(quizOptionSchema),
  correct_key: z.string().nullish(),
  seconds: z.number(),
  sort_order: z.number(),
  kind: kindField,
  correct_keys: z.array(z.string()).nullish(),
  accepted: z.array(z.string()).nullish(),
  match: z.enum(["exact", "close"]).nullish().catch(null),
  multi_rule: z.enum(["all", "proportional", "subtract"]).nullish().catch(null),
  order_rule: z.enum(["all", "partial"]).nullish().catch(null),
  /** The question's own points (null: the round's). */
  points: z.number().nullish(),
  double: z.boolean().nullish(),
  /** The points it is worth, overrides and doubling applied. */
  effective_points: z.number().nullish(),
});
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

/** A round's settings, as the server resolves them: every field present (CONTRACT 3.1). */
export const quizSettingsSchema = z.object({
  scoring: z.object({
    points: z.number(),
    speed: z.enum(["off", "linear", "steps"]),
    speed_share: z.number(),
    steps: z.array(z.object({ until: z.number(), share: z.number() })),
    wrong_penalty: z.number(),
    allow_negative: z.boolean(),
    streak_from: z.number(),
    streak_bonus: z.number(),
  }),
  flow: z.object({
    advance: z.enum(["host", "auto"]),
    auto_seconds: z.number(),
    reveal: z.enum(["time_up", "host"]),
    board: z.enum(["every", "every_n", "end"]),
    board_every: z.number(),
  }),
  players: z.object({
    names: z.enum(["nickname", "registered"]),
    filter_names: z.boolean(),
    late_join: z.boolean(),
    one_per_ticket: z.boolean(),
    anonymous_screen: z.boolean(),
  }),
  teams: z.object({
    mode: z.enum(["off", "pick", "auto"]),
    score: z.enum(["total", "average"]),
    list: z.array(z.object({ key: z.string(), name: z.string(), color: z.string() })),
  }),
  ties: z.enum(["join", "time"]),
  overall: z.boolean(),
});
export type QuizSettings = z.infer<typeof quizSettingsSchema>;
export type Team = QuizSettings["teams"]["list"][number];

/** Today's behaviour exactly: what a round nobody edited plays by (backend settings.QUIZ_DEFAULTS). */
export const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  scoring: {
    points: 1000,
    speed: "linear",
    speed_share: 0.5,
    steps: [
      { until: 0.25, share: 1.0 },
      { until: 0.5, share: 0.8 },
      { until: 0.75, share: 0.6 },
      { until: 1.0, share: 0.4 },
    ],
    wrong_penalty: 0,
    allow_negative: false,
    streak_from: 0,
    streak_bonus: 100,
  },
  flow: { advance: "host", auto_seconds: 8, reveal: "time_up", board: "every", board_every: 3 },
  players: { names: "nickname", filter_names: false, late_join: true, one_per_ticket: false, anonymous_screen: false },
  teams: { mode: "off", score: "total", list: [] },
  ties: "join",
  overall: true,
};

/** A malformed or missing settings object reads as today's. */
const settingsField = quizSettingsSchema.nullish().catch(null);

/** Where a round stands among the event's rounds (0-based index). */
export const roundPlaceSchema = z.object({ index: z.number(), count: z.number() });

export const quizSchema = z.object({
  id: z.string(),
  title: z.string(),
  intro: z.string().nullish(),
  status: z.enum(["draft", "live", "ended"]),
  join_code: z.string().nullish(),
  current_index: z.number(),
  players: z.number(),
  questions: z.array(quizQuestionSchema),
  sort_order: z.number().nullish(),
  settings: settingsField,
  round: roundPlaceSchema.nullish().catch(null),
});
export type Quiz = z.infer<typeof quizSchema>;

/** One round in the event's list of rounds. */
export const roundSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  intro: z.string().nullish(),
  status: z.enum(["draft", "live", "ended"]),
  sort_order: z.number(),
  questions: z.number(),
  players: z.number(),
  join_code: z.string().nullish(),
  settings: settingsField,
});
export type RoundSummary = z.infer<typeof roundSummarySchema>;

export const tallySchema = z.object({ key: z.string(), label: z.string(), count: z.number(), correct: z.boolean() });
export type TallyRow = z.infer<typeof tallySchema>;

/** A board row; `team` only when the round plays in teams. */
export const boardRowSchema = z.object({ rank: z.number(), name: z.string(), score: z.number(), team: z.string().nullish() });
export type BoardRow = z.infer<typeof boardRowSchema>;

/** A team on the teams' board. */
export const teamRowSchema = z.object({
  key: z.string(),
  name: z.string(),
  color: z.string(),
  players: z.number().nullish(),
  score: z.number(),
  rank: z.number().nullish(),
});
export type TeamRow = z.infer<typeof teamRowSchema>;

/** The board across the event's rounds; `registration` on the club's endpoints. */
export const overallRowSchema = z.object({
  rank: z.number(),
  name: z.string(),
  score: z.number(),
  rounds: z.number().nullish(),
  saved_ms: z.number().nullish(),
  registration: z
    .object({ id: z.string(), full_name: z.string().nullish(), ticket_id: z.string().nullish(), position: z.number().nullish() })
    .nullish()
    .catch(null),
});
export type OverallRow = z.infer<typeof overallRowSchema>;

/** Where a round is (CONTRACT 5.4). A server from before rounds sends none; `phaseOf` reads it from today's fields. */
export const PHASES = ["draft", "lobby", "question", "paused", "closed", "revealed", "ended"] as const;
export type Phase = (typeof PHASES)[number];

export const hostQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  options: z.array(quizOptionSchema),
  correct_key: z.string().nullish(),
  seconds: z.number(),
  time_left: z.number(),
  answered: z.number(),
  counts: z.array(tallySchema),
  sort_order: z.number().nullish(),
  opened_at: z.string().nullish(),
  kind: kindField,
  correct_keys: z.array(z.string()).nullish(),
  accepted: z.array(z.string()).nullish(),
  correct_order: z.array(z.string()).nullish(),
  effective_points: z.number().nullish(),
  double: z.boolean().nullish(),
  /** A typed answer's ten most given answers, normalised. */
  texts: z.array(z.object({ text: z.string(), count: z.number(), correct: z.boolean() })).nullish(),
  /** Players fully right (multi, type, order). */
  fully_correct: z.number().nullish(),
  reveal_at: z.string().nullish(),
  revealed: z.boolean().nullish(),
});
export type HostQuestion = z.infer<typeof hostQuestionSchema>;

export const hostStateSchema = z.object({
  status: z.enum(["draft", "live", "ended"]),
  join_code: z.string().nullish(),
  title: z.string(),
  players: z.number(),
  current_index: z.number(),
  total: z.number(),
  question: hostQuestionSchema.nullish(),
  leaderboard: z.array(boardRowSchema),
  quiz_id: z.string().nullish(),
  round: roundPlaceSchema.nullish().catch(null),
  phase: z.enum(PHASES).nullish().catch(null),
  paused: z.boolean().nullish(),
  board_now: z.boolean().nullish(),
  next_at: z.string().nullish(),
  settings: settingsField,
  teams: z.array(teamRowSchema).nullish().catch(null),
  overall: z.array(overallRowSchema).nullish().catch(null),
});
export type HostState = z.infer<typeof hostStateSchema>;

/** Where a round is: the server's phase, or (a server from before) worked out from today's fields. */
export function phaseOf(s: Pick<HostState, "status" | "phase" | "question">): Phase {
  if (s.phase) return s.phase;
  if (s.status === "draft") return "draft";
  if (s.status === "ended") return "ended";
  if (!s.question) return "lobby";
  return s.question.time_left === 0 ? "revealed" : "question";
}

export const HOST_ACTIONS = ["start", "next", "end", "reset", "reveal", "pause", "resume", "skip", "reopen"] as const;
export type HostAction = (typeof HOST_ACTIONS)[number];

/** The host state a start · next · end · reset returns; a start also says who was notified. */
export const hostActionSchema = hostStateSchema.extend({ notified: notifiedField });

/** A round's top player, with their registration when they joined signed in. */
export const winnerSchema = z.object({
  rank: z.number(),
  name: z.string(),
  score: z.number(),
  correct: z.number().nullish(),
  time_ms: z.number().nullish(),
  team: z.string().nullish(),
  player_id: z.string().nullish(),
  registration: z
    .object({ id: z.string(), full_name: z.string().nullish(), ticket_id: z.string().nullish(), position: z.number().nullish() })
    .nullish()
    .catch(null),
});
export type Winner = z.infer<typeof winnerSchema>;

/** Marking winners: who was marked, and who was skipped (no registration to mark). */
export const markOutSchema = z.object({
  marked: z.array(z.object({ rank: z.number(), name: z.string(), registration_id: z.string().nullish(), position: z.number().nullish() })),
  skipped: z.array(z.object({ rank: z.number(), name: z.string(), reason: z.string().nullish() })),
});
export type MarkOut = z.infer<typeof markOutSchema>;

export const SECONDS = [10, 20, 30, 60] as const;
/** Every length a question can be given in the editor (the server takes 5 to 300). */
export const QUESTION_SECONDS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300] as const;
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
  rating: z
    .object({
      average: z.number().nullable(),
      histogram: z.array(z.object({ value: z.number(), count: z.number(), pct: z.number() })),
      scale: z.number().nullish(),
    })
    .optional(),
  /** A ranking's options, best first: mean position (1 = top), Borda points, times ranked first. */
  ranking: z.array(z.object({ label: z.string(), average: z.number().nullish(), points: z.number().nullish(), first: z.number().nullish() })).optional(),
  /** An open-text poll's approved answers, newest first. */
  texts: z.array(z.object({ id: z.string(), text: z.string(), name: z.string().nullish(), at: z.string().nullish() })).optional(),
  /** An open-text poll's answers waiting for the host (the console only). */
  pending: z.number().nullish(),
});
export type PollResults = z.infer<typeof pollResultsSchema>;

export const POLL_KIND_VALUES = ["choice", "words", "rating", "ranking", "text"] as const;
export type PollKind = (typeof POLL_KIND_VALUES)[number];

/** A poll's settings, resolved (CONTRACT 7.1); today's when nothing was set. */
export const pollSettingsSchema = z.object({
  max_choices: z.number().catch(1),
  scale: z.number().catch(5),
  style: z.enum(["stars", "numbers"]).catch("stars"),
  results: z.enum(["live", "closed"]).catch("live"),
  show: z.enum(["both", "percent", "count"]).catch("both"),
  chart: z.enum(["bar", "column", "donut", "cloud"]).catch("bar"),
  hide_results: z.boolean().catch(false),
  anonymous: z.boolean().catch(true),
  change_vote: z.boolean().catch(true),
  seconds: z.number().nullish(),
  moderate: z.boolean().catch(true),
  option_images: z.array(z.string().nullable()).catch([]),
});
export type PollSettings = z.infer<typeof pollSettingsSchema>;

export const pollSchema = z.object({
  id: z.string(),
  kind: z.enum(POLL_KIND_VALUES),
  prompt: z.string(),
  options: z.array(z.string()),
  status: z.enum(["draft", "live", "closed"]),
  launched_at: z.string().nullish(),
  closed_at: z.string().nullish(),
  sort_order: z.number(),
  results: pollResultsSchema,
  my_response: z.string().nullish(),
  settings: pollSettingsSchema.partial().nullish().catch(null),
  closes_at: z.string().nullish(),
  option_images: z.array(mediaSchema.nullable()).nullish().catch(null),
  /** Whether guests see the results right now (the console and the screen always do). */
  results_hidden: z.boolean().nullish(),
});
export type Poll = z.infer<typeof pollSchema>;

/** The poll a launch or close returns; a launch also says who was notified. */
export const pollStatusSchema = pollSchema.extend({ notified: notifiedField });

/** An open-text answer, for the host to approve before anyone sees it. */
export const pollResponseSchema = z.object({
  id: z.string(),
  text: z.string(),
  name: z.string().nullish(),
  status: z.enum(["pending", "approved", "rejected"]).nullish().catch(null),
  at: z.string(),
});
export type PollResponse = z.infer<typeof pollResponseSchema>;

export const POLL_KINDS = [
  { value: "choice", label: "Multiple choice", hint: "Pick one of your answers, or up to a few" },
  { value: "words", label: "Word cloud", hint: "A word or two from everyone" },
  { value: "rating", label: "Rating", hint: "Stars out of 5, or a score out of 10" },
  { value: "ranking", label: "Ranking", hint: "Put your answers in order, best first" },
  { value: "text", label: "Open text", hint: "A line from everyone, shown once you approve it" },
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

// --- the look ----------------------------------------------------------------------

export const PRESET_KEYS = ["meridian_light", "meridian_dark", "high_contrast", "club"] as const;
export type PresetKey = (typeof PRESET_KEYS)[number];
export const DISPLAY_FONTS = ["dm_sans", "bebas_neue", "poppins", "space_grotesk"] as const;
export const BODY_FONTS = ["dm_sans", "inter", "poppins", "noto_sans"] as const;
export type DisplayFont = (typeof DISPLAY_FONTS)[number];
export type BodyFont = (typeof BODY_FONTS)[number];

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/** The live room's look, resolved by the server: every field present, text colours computed (CONTRACT 1.1). */
export const themeSchema = z.object({
  preset: z.enum(PRESET_KEYS),
  colors: z.object({ background: hex, accent: hex, answers: z.array(hex).length(6) }),
  text: z.object({ on_background: hex, on_accent: hex, on_answers: z.array(hex).length(6) }),
  font: z.object({ display: z.enum(DISPLAY_FONTS), body: z.enum(BODY_FONTS) }),
  answers: z.object({ style: z.enum(["shapes", "letters", "plain"]) }),
  timer: z.enum(["bar", "ring", "number", "hidden"]),
  leaderboard: z.object({ size: z.union([z.literal(5), z.literal(10)]), podium: z.boolean(), animate: z.boolean(), own_rank: z.boolean() }),
  logo: mediaSchema.nullish(),
  background: z.object({
    kind: z.enum(["color", "gradient", "image"]),
    gradient: z.object({ from: hex, to: hex, angle: z.number() }).nullish(),
    image: mediaSchema.nullish(),
    dim: z.number(),
  }),
  screen: z.object({
    text_scale: z.number(),
    logo: z.boolean(),
    sponsors: z.boolean(),
    join: z.enum(["corner", "lobby", "hidden"]),
    answer_layout: z.enum(["grid", "column"]),
  }),
  guest: z.object({
    text_scale: z.number(),
    logo: z.boolean(),
    background: z.enum(["plain", "theme"]),
    answer_layout: z.enum(["grid", "column"]),
  }),
});
export type Theme = z.infer<typeof themeSchema>;

/** A contrast verdict line: an error blocks saving, a warning does not. */
export const verdictSchema = z.object({
  field: z.string(),
  code: z.string(),
  message: z.string(),
  ratio: z.number().nullish(),
});
export type Verdict = z.infer<typeof verdictSchema>;

export const themeOutSchema = z.object({
  /** false: never saved; every renderer draws its own (pre-theme) look. */
  custom: z.boolean(),
  theme: themeSchema,
  version: z.string(),
  warnings: z.array(verdictSchema).catch([]),
  updated_at: z.string().nullish(),
});
export type ThemeOut = z.infer<typeof themeOutSchema>;

export const themeCheckSchema = z.object({
  ok: z.boolean(),
  errors: z.array(verdictSchema),
  warnings: z.array(verdictSchema),
  theme: themeSchema,
  version: z.string(),
});
export type ThemeCheck = z.infer<typeof themeCheckSchema>;

export const themePresetSchema = z.object({ key: z.enum(PRESET_KEYS), name: z.string(), theme: themeSchema });
export type ThemePreset = z.infer<typeof themePresetSchema>;

// --- the screen ----------------------------------------------------------------------

export const SCREEN_MODES = ["auto", "quiz", "poll", "qa", "idle", "leaderboard"] as const;
export type ScreenMode = (typeof SCREEN_MODES)[number];
export const IDLE_SLIDES = ["agenda", "sponsors", "join"] as const;
export type IdleSlide = (typeof IDLE_SLIDES)[number];

/** What the big screen shows and how (CONTRACT 8.1); the defaults are today's screen. */
export const screenControlSchema = z.object({
  mode: z.enum(SCREEN_MODES).catch("auto"),
  results: z.enum(["live", "hidden"]).catch("live"),
  ticker: z.boolean().catch(false),
  idle_slides: z.array(z.enum(IDLE_SLIDES)).catch([]),
  slide_seconds: z.number().catch(12),
  wall_size: z.number().catch(6),
  // The host club and partner logos along the foot; a server from before it sends none: on.
  logo_footer: z.boolean().catch(true),
  // The organiser's own wide picture in place of the logos (read only: set by its upload).
  footer_image_url: z.string().nullish().catch(null),
});
export type ScreenControl = z.infer<typeof screenControlSchema>;
export const DEFAULT_SCREEN_CONTROL: ScreenControl = { mode: "auto", results: "live", ticker: false, idle_slides: [], slide_seconds: 12, wall_size: 6, logo_footer: true };

/** Whether the screen's controls are as they always were: nothing asked of the screen beyond today's. */
export const isDefaultControl = (c: ScreenControl | null | undefined) =>
  !c || (c.mode === "auto" && c.results === "live" && !c.ticker && c.idle_slides.length === 0);

export const agendaSlotSchema = z.object({
  id: z.string(),
  title: z.string(),
  starts_at: z.string(),
  ends_at: z.string().nullish(),
  speaker: z.string().nullish(),
  location: z.string().nullish(),
  now: z.boolean().nullish(),
});
export type AgendaSlot = z.infer<typeof agendaSlotSchema>;

export const sponsorSchema = z.object({
  name: z.string(),
  label: z.string().nullish(),
  logo: z.object({ thumbnail: z.string().nullish(), medium: z.string().nullish(), large: z.string().nullish() }).nullish(),
});
export type Sponsor = z.infer<typeof sponsorSchema>;

/** The logo strip's entries (the backend's games club_of / partners_of). */
export const screenClubSchema = z.object({ name: z.string(), logo_url: z.string().nullish() });
export type ScreenClub = z.infer<typeof screenClubSchema>;
export const screenPartnerSchema = z.object({
  name: z.string(),
  logo_url: z.string(),
  kind: z.string().nullish(),
  label: z.string().nullish(),
});
export type ScreenPartner = z.infer<typeof screenPartnerSchema>;

export const screenSchema = z.object({
  event: z.object({ id: z.number(), name: z.string() }),
  pinned: questionSchema.nullish(),
  board: z.array(questionSchema),
  poll: pollSchema.nullish(),
  quiz: hostStateSchema.nullish(),
  update: updateSchema.nullish(),
  // This release: a theme that does not parse draws the screen's own look rather than no screen.
  theme: themeSchema.nullish().catch(null),
  theme_custom: z.boolean().nullish(),
  theme_version: z.string().nullish(),
  control: screenControlSchema.nullish().catch(null),
  shows: z.enum(["quiz", "poll", "qa", "idle", "leaderboard"]).nullish().catch(null),
  wall: z.array(questionSchema).nullish(),
  updates: z.array(updateSchema).nullish(),
  agenda: z.array(agendaSlotSchema).nullish().catch(null),
  sponsors: z.array(sponsorSchema).nullish().catch(null),
  overall: z.array(overallRowSchema).nullish().catch(null),
  club: screenClubSchema.nullish().catch(null),
  partners: z.array(screenPartnerSchema).nullish().catch(null),
  cohosts: z.array(screenClubSchema).nullish().catch(null),
  footer_image_url: z.string().nullish().catch(null),
});
export type Screen = z.infer<typeof screenSchema>;
