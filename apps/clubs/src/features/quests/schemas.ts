import { z } from "zod";

import { doorPurpose } from "@/features/gate/schemas";
import { partialCode, partialText } from "@/lib/masked";

/**
 * Event quests, the organiser's side (feature-register/quests/CONTRACT.md
 * §9): the switch and settings, tasks, milestones and their rewards from
 * the event's swag, stations and swag desks, the live numbers, the guests
 * with their grants and revokes, and the audit. Every field is read
 * leniently, so an answer with a field more or less never takes the page
 * down; a list item that can't be read is left out rather than failing the
 * list.
 */

const count = z.number().catch(0);
const text = z.string().catch("");
const maybeText = z.string().nullish().catch(null).transform((v) => v ?? null);
const when = z.string().nullish().catch(null).transform((v) => v ?? null);

/** A list whose unreadable items are left out (one odd row never blanks the page). */
const listOf = <T extends z.ZodTypeAny>(item: T) =>
  z
    .array(z.unknown())
    .catch([])
    .transform((rows) =>
      rows.flatMap((row): z.infer<T>[] => {
        const r = item.safeParse(row);
        return r.success ? [r.data] : [];
      })
    );

// ─── Settings ────────────────────────────────────────────────────────────

export const QUEST_MODES = ["checkmarks", "points"] as const;
export type QuestMode = (typeof QUEST_MODES)[number];

export const LEADERBOARD_NAMES = ["initial", "full"] as const;
export type LeaderboardNames = (typeof LEADERBOARD_NAMES)[number];

export const ATTEMPTS_MIN = 1;
export const ATTEMPTS_MAX = 50;
export const TITLE_MAX = 80;
export const INTRO_MAX = 400;
/** A task's or milestone's title, and a station's name, as the server takes them. */
export const TASK_TITLE_MAX = 80;
export const STATION_NAME_MAX = 40;

const settingsShape = {
  id: z.string().nullish().catch(null),
  event_id: z.number().nullish().catch(null),
  enabled: z.boolean().catch(false),
  title: text,
  intro: text,
  mode: z.enum(QUEST_MODES).catch("checkmarks"),
  starts_at: when,
  ends_at: when,
  leaderboard: z.boolean().catch(false),
  leaderboard_names: z.enum(LEADERBOARD_NAMES).catch("initial"),
  code_attempts_per_hour: z.number().catch(10),
  updated_at: when,
};

/** What a settings save sends: any part of them. */
export interface QuestSettingsPatch {
  enabled?: boolean;
  title?: string;
  intro?: string;
  mode?: QuestMode;
  starts_at?: string | null;
  ends_at?: string | null;
  leaderboard?: boolean;
  leaderboard_names?: LeaderboardNames;
  code_attempts_per_hour?: number;
}

// ─── Tasks ───────────────────────────────────────────────────────────────

export const TASK_KINDS = [
  "checked_in",
  "network",
  "quiz_played",
  "quiz_score",
  "quiz_top",
  "polls",
  "qa_question",
  "feedback",
  "poster_made",
  "poster_link",
  "follow_club",
  "profile_complete",
  "station",
  "code",
  "manual",
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const taskSchema = z.object({
  id: z.string(),
  /** Kept as sent: a kind this dashboard doesn't know yet still lists, with the server's title. */
  kind: z.string(),
  title: text,
  description: maybeText,
  points: count,
  required: z.boolean().catch(false),
  starts_at: when,
  ends_at: when,
  config: z.record(z.unknown()).nullish().catch(null).transform((v) => v ?? {}),
  sort_order: count,
  target: z.number().catch(1),
  action: maybeText,
  /** Guests who have it, and who are on their way (a count started, not reached). */
  done_count: count,
  in_progress: count.optional(),
  /** A station task: the station it names. */
  station: z.object({ door_id: z.string(), name: text }).nullish().catch(null).transform((v) => v ?? null),
  /** Kept for the record (some guests had it) after it was deleted. */
  archived: z.boolean().catch(false).optional(),
});
export type QuestTask = z.infer<typeof taskSchema>;

/** What a task save sends (kind only when it is made). */
export interface TaskInput {
  kind?: string;
  title: string;
  description?: string | null;
  points?: number;
  required?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  config: Record<string, unknown>;
}

/** One field of a task kind's rule, as the templates describe it (§9.1). */
export const templateFieldSchema = z.object({
  key: z.string(),
  type: z.string().catch("string"),
  label: maybeText.optional(),
  min: z.number().nullish().catch(null),
  max: z.number().nullish().catch(null),
  options: z
    .array(z.union([z.string(), z.object({ value: z.string(), label: z.string().nullish() })]))
    .nullish()
    .catch(null)
    .transform((v) => (v ?? []).map((o) => (typeof o === "string" ? { value: o, label: null } : { value: o.value, label: o.label ?? null }))),
  required: z.boolean().nullish().catch(null),
});
export type TemplateField = z.infer<typeof templateFieldSchema>;

export const templateSchema = z.object({
  kind: z.string(),
  label: text,
  description: maybeText,
  default_title: text,
  default_config: z.record(z.unknown()).nullish().catch(null).transform((v) => v ?? {}),
  fields: listOf(templateFieldSchema),
});
export type TaskTemplate = z.infer<typeof templateSchema>;
export const templatesSchema = listOf(templateSchema);

// ─── Milestones and rewards ──────────────────────────────────────────────

export const SOLD_OUT_MODES = ["first_come", "waitlist"] as const;
export type SoldOutMode = (typeof SOLD_OUT_MODES)[number];

const stockVariantSchema = z.object({
  id: z.string().catch(""),
  label: text,
  total: count,
  reserved: count,
  collected: count,
  free: count,
});
export const stockSchema = z
  .object({ total: count, reserved: count, collected: count, free: count, variants: listOf(stockVariantSchema) })
  .catch({ total: 0, reserved: 0, collected: 0, free: 0, variants: [] });
export type RewardStock = z.infer<typeof stockSchema>;

const claimCountsSchema = z
  .object({ reserved: count, needs_size: count, waitlisted: count, sold_out: count, collected: count, released: count })
  .catch({ reserved: 0, needs_size: 0, waitlisted: 0, sold_out: 0, collected: 0, released: 0 });

export const rewardSchema = z.object({
  id: z.string(),
  merch_item_id: z.string().catch(""),
  name: text,
  photo_url: maybeText,
  sold_out_mode: z.enum(SOLD_OUT_MODES).catch("first_come"),
  sizes: z.boolean().catch(false),
  stock: stockSchema,
  claims: claimCountsSchema,
});
export type QuestReward = z.infer<typeof rewardSchema>;

export const milestoneSchema = z.object({
  id: z.string(),
  title: text,
  threshold: z.number().catch(1),
  sort_order: count,
  rewards: listOf(rewardSchema),
});
export type QuestMilestone = z.infer<typeof milestoneSchema>;

// ─── Stations, swag items ────────────────────────────────────────────────

const linkShape = z
  .object({ prefix: z.string().catch(""), can_walkup: z.boolean().catch(false), expires_at: when, expired: z.boolean().catch(false) })
  .nullish()
  .catch(null)
  .transform((v) => v ?? null);

/**
 * A station or swag desk: a door with a purpose (§7). Read whether the
 * server names its id `door_id` or `id`.
 */
export const stationSchema = z.preprocess(
  (raw) => (raw && typeof raw === "object" && !("id" in raw) && "door_id" in raw ? { ...raw, id: (raw as { door_id: unknown }).door_id } : raw),
  z.object({
    id: z.string(),
    name: text,
    purpose: doorPurpose,
    active: z.boolean().catch(true),
    link: linkShape,
    visits: count,
    last_visit_at: when,
    /** Handovers at a swag desk, when the server counts them. */
    handovers: count.optional(),
    task: z.object({ id: z.string(), title: text, points: count }).nullish().catch(null).transform((v) => v ?? null),
  })
);
export type QuestStation = z.infer<typeof stationSchema>;

/** One of the event's swag items, for the reward picker: its stock (free, by size), and whether it is a reward already. */
export const swagItemSchema = z
  .object({
    id: z.string(),
    name: text,
    photo_url: maybeText,
    sizes: z.boolean().catch(false),
    stock: stockSchema.optional(),
    /** Set when the item is already a reward of this quest (it can be one only once). */
    reward_id: maybeText.optional(),
  })
  .transform((i) => ({ ...i, free: i.stock ? i.stock.free : null }));
export type SwagItem = z.infer<typeof swagItemSchema>;

// ─── The whole quest, as the organiser reads it ──────────────────────────

/**
 * GET /events/{id}/quests: the settings with the tasks, milestones (with
 * rewards and stock), stations and swag items. Settings may come at the top
 * level or under `settings`; both read the same.
 */
export const questAdminSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const r = raw as Record<string, unknown>;
    return r.settings && typeof r.settings === "object" ? { ...(r.settings as object), ...r } : r;
  },
  z.object({
    ...settingsShape,
    tasks: listOf(taskSchema),
    milestones: listOf(milestoneSchema),
    stations: listOf(stationSchema),
    swag_items: listOf(swagItemSchema),
  })
);
export type QuestAdmin = z.infer<typeof questAdminSchema>;

// ─── Live numbers ────────────────────────────────────────────────────────

export const dashboardSchema = z.object({
  enabled: z.boolean().catch(false),
  participants: count,
  checked_in: count,
  tasks: listOf(z.object({ id: z.string(), title: text, kind: text, done: count, in_progress: count })),
  milestones: listOf(z.object({ id: z.string(), title: text, threshold: count, unlocked: count })),
  rewards: listOf(
    z.object({ id: z.string(), name: text, reserved: count, needs_size: count, waitlisted: count, sold_out: count, collected: count, stock: stockSchema })
  ),
  stations: listOf(z.object({ door_id: z.string().catch(""), name: text, purpose: doorPurpose, visits: count, last_visit_at: when })),
  recent: listOf(z.object({ at: text, name: text, what: text })),
  computed_at: when,
});
export type QuestDashboard = z.infer<typeof dashboardSchema>;

export const leaderboardSchema = z.object({
  mode: z.enum(QUEST_MODES).catch("points"),
  rows: listOf(z.object({ rank: count, name: text, score: count })),
});
export type Leaderboard = z.infer<typeof leaderboardSchema>;

// ─── Guests ──────────────────────────────────────────────────────────────

export const CLAIM_STATUS_LABEL: Record<string, string> = {
  reserved: "Held",
  waitlisted: "Waiting list",
  sold_out: "Sold out",
  collected: "Collected",
  released: "Released",
};

export const guestRowSchema = z.object({
  registration_id: z.string(),
  name: text,
  /** Masked for door staff, or absent (lib/masked). */
  email: partialText,
  ticket_id: partialCode,
  checked_in: z.boolean().catch(false),
  points: count,
  tasks_done: count,
  milestones: z.array(z.string()).catch([]),
  claims: listOf(z.object({ reward_id: z.string().catch(""), name: text, status: text, variant_label: maybeText })),
});
export type QuestGuestRow = z.infer<typeof guestRowSchema>;

export const guestListSchema = z.object({
  items: listOf(guestRowSchema),
  total: count,
  page: z.number().catch(1),
  page_size: z.number().catch(50),
});
export type QuestGuestList = z.infer<typeof guestListSchema>;

export const GUEST_SORTS = ["points", "name", "recent"] as const;
export type GuestSort = (typeof GUEST_SORTS)[number];

export interface GuestQuery {
  q?: string | undefined;
  milestoneId?: string | undefined;
  taskId?: string | undefined;
  claimStatus?: string | undefined;
  sort?: GuestSort;
  page: number;
  pageSize: number;
}

const meSchema = z
  .object({ count: count, done: z.boolean().catch(false), done_at: when, source: maybeText, revoked: z.boolean().catch(false) })
  .nullish()
  .catch(null)
  .transform((v) => v ?? null);

export const guestTaskSchema = z.object({
  id: z.string(),
  kind: text,
  title: text,
  points: count,
  required: z.boolean().catch(false),
  target: z.number().catch(1),
  me: meSchema,
});
export type GuestTask = z.infer<typeof guestTaskSchema>;

const cardClaimSchema = z
  .object({
    claim_id: z.string().catch(""),
    status: text,
    needs_size: z.boolean().catch(false),
    variant_label: maybeText,
    waitlist_position: z.number().nullish().catch(null),
    collected_at: when,
    /** Where a collected reward was handed over (contract v1.3). */
    door: maybeText.optional(),
  })
  .nullish()
  .catch(null)
  .transform((v) => v ?? null);

export const auditRowSchema = z.object({
  at: text,
  by: z.object({ id: z.number().nullish(), name: maybeText }).nullish().catch(null),
  action: text,
  registration_id: maybeText,
  name: text,
  task: z.object({ id: z.string(), title: text }).nullish().catch(null),
  reward: z.object({ id: z.string(), name: text }).nullish().catch(null),
  note: maybeText,
  /** A handover's door ("Swag desk"). `by.name` is null when it went through a door link: nobody signed in. */
  detail: z.object({ door: maybeText.optional() }).nullish().catch(null),
});
export type AuditRow = z.infer<typeof auditRowSchema>;

/** One guest as the organiser sees them: the card (every task with theirs), and their grants and revokes. */
export const guestViewSchema = z.object({
  tasks: listOf(guestTaskSchema),
  milestones: listOf(
    z.object({
      id: z.string(),
      title: text,
      threshold: count,
      unlocked: z.boolean().catch(false),
      unlocked_at: when,
      rewards: listOf(z.object({ reward_id: z.string().catch(""), name: text, claim: cardClaimSchema })),
    })
  ),
  me: z
    .object({ registration_id: maybeText, points: count, tasks_done: count, required_left: count })
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  /** Who they are: the organiser's view names them. */
  guest: z
    .object({ registration_id: z.string().catch(""), name: text, email: partialText, ticket_id: partialCode })
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  audit: listOf(auditRowSchema),
});
export type QuestGuestView = z.infer<typeof guestViewSchema>;

export const auditListSchema = z.object({ items: listOf(auditRowSchema), total: count });

export const AUDIT_LABEL: Record<string, string> = {
  grant: "Granted",
  revoke: "Revoked",
  release: "Released",
  reoffer: "Re-offered",
  handover: "Handed over",
};
