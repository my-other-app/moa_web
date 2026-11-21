import { z } from "zod";

import { partialCode, partialText } from "@/lib/masked";

/** The door's answers, as the server speaks them (snake_case, like the rest of the event API). */
export const SCAN_OUTCOMES = ["CHECKED_IN", "ALREADY_CHECKED_IN", "WRONG_EVENT", "REVOKED", "UNPAID", "INVALID", "EVENT_NOT_OPEN", "STATION_VISIT", "SWAG_DESK"] as const;

/**
 * Doors that are not entrances (quests contract §7): a station records a
 * visit, a swag desk hands quest rewards over. Neither ever admits anyone.
 * Every door from before is an entrance (purpose null).
 */
export const DOOR_PURPOSES = ["station", "swag_desk"] as const;
export type DoorPurpose = (typeof DOOR_PURPOSES)[number];
/** A purpose as the API sends it: a missing or unknown one is an entrance (null). */
export const doorPurpose = z
  .enum(DOOR_PURPOSES)
  .nullish()
  .catch(null)
  .transform((v): DoorPurpose | null => v ?? null);

/**
 * Sent on every gate request: this console knows stations and swag desks, so
 * the server lists them and answers their scans as STATION_VISIT / SWAG_DESK.
 * (A console without it is answered INVALID there, and admits nobody.)
 */
export const GATE_FEATURES_HEADER = "X-Gate-Features";
export const GATE_FEATURES = "quests";

/** INVALID with one of these: a console from before this one scanned at a station or a swag desk. */
export const QUEST_STATION_HINT = "QUEST_STATION";
export const QUEST_SWAG_DESK_HINT = "QUEST_SWAG_DESK";

/**
 * INVALID with this hint: the code was the admission number printed beside
 * the QR, not a ticket. Nobody was admitted; `attendee` is who holds it, for
 * staff to confirm and check in by hand. Absent on an API from before.
 */
export const ADMISSION_NUMBER_HINT = "ADMISSION_NUMBER";

/** A question this guest must answer and hasn't (missing-answers contract §2.5): soft, never a refusal. */
export const missingAnswerSchema = z.object({ key: z.string(), label: z.string().nullish().transform((v) => v ?? null) });
export type MissingAnswer = z.infer<typeof missingAnswerSchema>;
const missingAnswersField = z.array(missingAnswerSchema).nullish().catch(null).transform((v) => v ?? []);

export const attendeeSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Masked for door staff in a search ("•••• 4321"), or left out: "" then (lib/masked). */
  ticket_id: partialCode,
  role: z.string(),
  /** Masked for door staff in a search, or absent (lib/masked). */
  email: partialText.optional(),
  phone: partialText.optional(),
  has_contact: z.boolean().default(false),
  is_paid: z.boolean().default(true),
  checked_in_at: z.string().nullish(),
  badge_printed_at: z.string().nullish(),
  admission_no: z.string().nullish(),
  /**
   * What they haven't answered; [] when nothing, and from a server without it
   * (read it with missingOf). The door sees it and may fill it.
   */
  missing_answers: missingAnswersField.optional(),
});
export type AttendeeSummary = z.infer<typeof attendeeSummarySchema>;

/** The fewest characters the door search sends: the API answers nothing shorter. */
export const SEARCH_MIN = 3;

/** What a guest at the door is missing: [] when nothing, or from a server that doesn't say. */
export const missingOf = (a: { missing_answers?: MissingAnswer[] | null } | null | undefined): MissingAnswer[] => a?.missing_answers ?? [];

/** POST …/gate/answers/{registration_id}: what is still missing after the door filled some. */
export const gateAnswersResultSchema = z.object({ missing_answers: missingAnswersField });

/** STATION_VISIT: what a scan at a station came to (quests contract §7.2). */
export const STATION_RESULTS = ["VISITED", "ALREADY_VISITED", "NOT_COUNTED"] as const;
export type StationResult = (typeof STATION_RESULTS)[number];

/**
 * How the quest scores (v1.3): points mean something only in "points" mode,
 * so door staff see them only then. Null without a quest, or from a server
 * that doesn't say: then no points are shown either.
 */
export const questModeSchema = z.enum(["checkmarks", "points"]).nullish().catch(null);
export type QuestMode = z.infer<typeof questModeSchema>;

export const stationVisitSchema = z.object({
  door_id: z.string().nullish().catch(null),
  name: z.string().catch(""),
  /** An answer this console doesn't know reads as "recorded, credits nothing": never a welcome. */
  result: z.enum(STATION_RESULTS).catch("NOT_COUNTED"),
  /** NOT_COUNTED: "QUESTS_OFF" | "OUTSIDE_WINDOW" | "NO_TASK". */
  reason: z.string().nullish().catch(null),
  /** The first visit's time. */
  visited_at: z.string().nullish().catch(null),
  task: z.object({ id: z.string(), title: z.string().catch(""), points: z.number().catch(0) }).nullish().catch(null),
  mode: questModeSchema,
});
export type StationVisit = z.infer<typeof stationVisitSchema>;

export const CLAIM_STATUSES = ["reserved", "waitlisted", "sold_out", "collected", "released"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/** One of the guest's quest rewards at the swag desk (§7.3). */
export const deskRewardSchema = z.object({
  claim_id: z.string(),
  reward_id: z.string().nullish().catch(null),
  milestone: z.string().nullish().catch(null),
  item_id: z.string().nullish().catch(null),
  name: z.string().catch(""),
  photo_url: z.string().nullish().catch(null),
  /** Unknown statuses read as released: never offered for a handover. */
  status: z.enum(CLAIM_STATUSES).catch("released"),
  needs_size: z.boolean().catch(false),
  variant_label: z.string().nullish().catch(null),
  /** Sizes with a free unit, when a size is still to pick (or to change it). */
  choices: z
    .array(z.union([z.string(), z.object({ label: z.string(), free: z.number().nullish() })]))
    .catch([])
    .transform((v) => v.map((c) => (typeof c === "string" ? { label: c, free: null } : { label: c.label, free: c.free ?? null }))),
  waitlist_position: z.number().nullish().catch(null),
  collected_at: z.string().nullish().catch(null),
  /** Who handed it over: a person's name, or null for a swag desk's door link (nobody signed in: then only `door`, "at Swag desk"). */
  collected_by: z.string().nullish().catch(null),
  door: z.string().nullish().catch(null),
});
export type DeskReward = z.infer<typeof deskRewardSchema>;

/** SWAG_DESK: the guest's quest standing and rewards, at a swag desk (§7.3). */
export const swagDeskSchema = z.object({
  door_id: z.string().nullish().catch(null),
  name: z.string().catch(""),
  enabled: z.boolean().catch(true),
  mode: questModeSchema,
  points: z.number().catch(0),
  tasks_done: z.number().catch(0),
  rewards: z
    .array(z.unknown())
    .catch([])
    .transform((items) =>
      items.flatMap((i) => {
        const r = deskRewardSchema.safeParse(i);
        return r.success && r.data.status !== "released" ? [r.data] : [];
      })
    ),
});
export type SwagDesk = z.infer<typeof swagDeskSchema>;

/** GET …/gate/quests/{registration_id}: the swag block plus the stations they visited. */
export const gateQuestGuestSchema = swagDeskSchema.extend({
  attendee: z.object({ id: z.string(), name: z.string() }).nullish().catch(null),
  stations: z
    .array(z.object({ door_id: z.string().nullish(), name: z.string().catch(""), visited_at: z.string().nullish() }))
    .catch([]),
});
export type GateQuestGuest = z.infer<typeof gateQuestGuestSchema>;

export const HANDOVER_RESULTS = ["HANDED_OVER", "ALREADY_COLLECTED", "NEEDS_SIZE", "SIZE_GONE", "NOT_RESERVED"] as const;
export const handoverResultSchema = z.object({
  result: z.enum(HANDOVER_RESULTS),
  claim: deskRewardSchema.nullish().catch(null),
  remaining: z.number().nullish().catch(null),
});
export type HandoverResult = z.infer<typeof handoverResultSchema>;

export const scanResultSchema = z.object({
  outcome: z.enum(SCAN_OUTCOMES),
  attendee: attendeeSummarySchema.nullable(),
  checked_in_at: z.string().nullable(),
  checked_in_by: z.object({ name: z.string(), door: z.string() }).nullable(),
  other_event: z.object({ name: z.string(), starts_at: z.string().nullish() }).nullable(),
  revoked_at: z.string().nullable(),
  capture: z.object({ ask: z.boolean(), required: z.boolean(), reason: z.string() }),
  replayed: z.boolean().default(false),
  /** What the console should do about the ID card. */
  badge: z.object({ auto: z.boolean(), may_print: z.boolean(), printed_at: z.string().nullish(), policy: z.string() }).default({ auto: false, may_print: false, printed_at: null, policy: "anyone" }),
  /** Why a refusal is what it is, when the server says: ADMISSION_NUMBER_HINT. */
  hint: z.string().nullish(),
  /**
   * The server could not record this scan just now (it failed on its side,
   * not on the ticket), and wants it sent again. It comes with the outcome
   * INVALID, which then is not an answer about the ticket. Absent on an
   * API from before.
   */
  retry: z.boolean().optional().catch(undefined),
  /** STATION_VISIT only: the visit (absent at an entrance). */
  station: stationVisitSchema.nullish().catch(null),
  /** SWAG_DESK only: the guest's rewards (absent at an entrance). */
  swag: swagDeskSchema.nullish().catch(null),
});
export type ScanResult = z.infer<typeof scanResultSchema>;

const batchItemSchema = z.object({
  client_ref: z.string(),
  response: scanResultSchema,
  /** The same ask as `response.retry`, should the server put it beside the answer. */
  retry: z.boolean().optional().catch(undefined),
});
export type ScanBatchItem = z.infer<typeof batchItemSchema>;

/**
 * The server's answer to a replayed batch, one scan at a time: an answer
 * this console cannot read (an outcome it doesn't know, a field missing) is
 * left out, as if the server had not answered for that scan, so the scan
 * stays on the phone for the next try rather than being dropped unread.
 */
export const scanBatchResultSchema = z.object({
  results: z.array(z.unknown()).transform((items) =>
    items.flatMap((item): ScanBatchItem[] => {
      const read = batchItemSchema.safeParse(item);
      return read.success ? [read.data] : [];
    })
  ),
});

/** The server asked for this saved scan again: it has no answer about the ticket yet. */
export const askedAgain = (item: Pick<ScanBatchItem, "retry" | "response">): boolean => item.retry === true || item.response.retry === true;

export const walkupResultSchema = z.object({
  outcome: z.enum(["REGISTERED", "DUPLICATE", "EVENT_NOT_OPEN"]),
  attendee: attendeeSummarySchema.nullable(),
  duplicate_of: z.object({ id: z.string(), name: z.string() }).nullable(),
  duplicate_by: z.enum(["CONTACT", "NAME"]).nullable(),
  checked_in: z.boolean().default(false),
  ticket_sent: z.boolean().default(false),
});
export type WalkupResult = z.infer<typeof walkupResultSchema>;

export const doorOptionSchema = z.object({ id: z.string(), name: z.string(), kind: z.string(), purpose: doorPurpose.optional() });

/** `/gate/context` for a console that knows quests (§7.5): null when the event has no quest. */
export const gateQuestsSchema = z.object({
  enabled: z.boolean().catch(false),
  mode: questModeSchema,
  /** The purpose of the door this console is on: the link's, else the volunteer's assigned door's. */
  door_purpose: doorPurpose.optional(),
  door_name: z.string().nullish().catch(null),
  /** Whether this console may hand quest rewards over (merch rights, or a swag desk's own link). */
  can_hand_over: z.boolean().catch(false),
});
export type GateQuests = z.infer<typeof gateQuestsSchema>;

/** A value a stored question may hold as `null`, read as absent. */
const absentIfNull = <T extends z.ZodTypeAny>(schema: T) => schema.nullish().transform((v): z.infer<T> | undefined => v ?? undefined);

/**
 * One of the event's own questions, as the door reads it. A question can be
 * stored with `null` where it has nothing (a text question's `options`): read
 * as absent, never as a reason the console cannot open. It only shapes the
 * walk-up form and the missing answers; the door must open whatever it says.
 */
export const guestFieldSchema = z
  .object({
    key: z.string(),
    label: z.string().nullish().transform((v) => v ?? ""),
    field_type: absentIfNull(z.string()),
    options: absentIfNull(z.array(z.string())),
    required: absentIfNull(z.boolean()),
  })
  .passthrough();

export const gateContextSchema = z.object({
  event: z.object({
    id: z.number(),
    name: z.string(),
    code: z.string(),
    org_name: z.string().default(""),
    door_open: z.boolean(),
    door_mode: z.string(),
    close_after_minutes: z.number(),
    spot_registration_checks_in: z.boolean(),
    capture_contact_at_gate: z.boolean(),
    require_contact_at_gate: z.boolean(),
    has_fee: z.boolean().default(false),
    starts_at: z.string().nullish(),
    ticket_example: z.string().default("MOA-XXXXX-XXXXX"),
    auto_print_badges: z.boolean().default(false),
    reprint_policy: z.string().default("anyone"),
  }),
  permissions: z.object({ check_in: z.boolean(), walkup: z.boolean(), merch: z.boolean(), full: z.boolean() }),
  counters: z.object({ registered: z.number(), checked_in: z.number() }),
  walkup_roles: z.array(z.string()),
  doors: z.array(doorOptionSchema),
  expected_door_id: z.string().nullable(),
  guest_fields: z.array(guestFieldSchema),
  me: z.object({ name: z.string(), kind: z.enum(["user", "door"]) }),
  /** Whether there is anything to hand out; the console shows the merch tab only then. */
  has_merch: z.boolean().default(false),
  /** Whether the event sells merchandise: the walk-up form shows the shelf, and the merch tab shows paid orders. */
  has_store: z.boolean().default(false),
  /** The event's quest as the door sees it; absent from a server without quests, null for an event without one. */
  quests: gateQuestsSchema.nullish().catch(null),
});
export type GateContext = z.infer<typeof gateContextSchema>;

/**
 * What the door this console is on is for: an entrance (null, as every door
 * was before), a station or a swag desk. A gate link's door is fixed and the
 * server says its purpose; otherwise it is the purpose of the door picked by
 * name. A name the console was given by hand is an entrance, as the server
 * reads it.
 */
export function purposeOf(ctx: Pick<GateContext, "doors" | "me" | "quests">, door: string): DoorPurpose | null {
  if (ctx.me.kind === "door" && ctx.quests?.door_purpose) return ctx.quests.door_purpose;
  return ctx.doors.find((d) => d.name === door)?.purpose ?? null;
}

export const captureResultSchema = z.object({ phone: z.string(), shared_with: z.array(z.string()).default([]) });

export interface ScanBody {
  code: string;
  door?: string | null;
  scanned_at: string;
  client_ref: string;
}

export interface WalkupBody {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  /** The event's own questions; a several-choices one answered with more than one tick is a list. */
  custom_fields?: Record<string, string | string[]>;
  confirm_new?: boolean;
  door?: string | null;
  client_ref: string;
  /** What they take from the shelf, paid at the desk with the ticket. */
  store?: { item_id: string; variant_id: string | null; qty: number }[];
}

export const gateStoreOrderSchema = z.object({
  id: z.string(),
  guest: z.string(),
  status: z.string(),
  total: z.number(),
  summary: z.string(),
  lines: z.array(z.object({ item_name: z.string(), variant_label: z.string().nullable(), qty: z.number(), is_free: z.boolean() })),
  handed_over_at: z.string().nullable(),
});

export const gateCatalogSchema = z.object({
  enabled: z.boolean(),
  items: z.array(z.object({ id: z.string(), name: z.string(), price: z.number(), left: z.number().nullable(), variants: z.array(z.object({ id: z.string(), label: z.string(), left: z.number() })) })),
});
export type GateCatalog = z.infer<typeof gateCatalogSchema>;

export const ROLE_LABEL: Record<string, string> = { attendee: "Attendee", speaker: "Speaker", staff: "Staff" };

export const newRef = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
