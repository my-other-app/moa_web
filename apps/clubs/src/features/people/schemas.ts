import { z } from "zod";

/**
 * One person, everything about them (guest-profile contract §1:
 * `GET /api/v1/events/{event_id}/people/{ref}`). Strict on what the screen
 * acts on (the stage, the actions, a timeline row's time and words); every
 * other field is read if it is there and left out if it is not, so a server
 * a version behind still shows a profile.
 */

const text = z.string().nullish().catch(null).transform((v) => v ?? null);
const flag = z.boolean().nullish().catch(null).transform((v) => v ?? false);
const maybeFlag = z.boolean().nullish().catch(null).transform((v) => v ?? null);
const count = z.number().catch(0).default(0);
/** Amounts come as numbers or as text; shown as given. */
const amount = z.union([z.number(), z.string()]).nullish().catch(null).transform((v) => (v === null || v === undefined || v === "" ? null : v));

export const STAGES = ["under_review", "waitlisted", "confirmed", "declined", "cancelled", "removed"] as const;
export type Stage = (typeof STAGES)[number];

export const TONES = ["default", "success", "warning", "danger", "info"] as const;
export type Tone = (typeof TONES)[number];

export const PRINT_STATES = ["queued", "printing", "printed", "failed", "cancelled"] as const;
export type PrintState = (typeof PRINT_STATES)[number];

const personSchema = z
  .object({
    full_name: z.string().nullish().transform((v) => v?.trim() || "Unnamed"),
    email: text,
    phone: text,
    institution: text,
    role: text,
    photo_url: text,
    account: z
      .object({ kind: z.string().catch("none"), user_id: z.union([z.string(), z.number()]).nullish().catch(null) })
      .nullish()
      .catch(null)
      .transform((v) => v ?? null),
  })
  .default({ full_name: "Unnamed" } as never);

const statusSchema = z
  .object({
    stage: z
      .string()
      .catch("confirmed")
      .transform((s): Stage => ((STAGES as readonly string[]).includes(s) ? (s as Stage) : "confirmed")),
    checked_in: flag,
    card_printed: flag,
    certificate: z.string().catch("none").default("none"),
    paid: maybeFlag,
    ticket_revoked: flag,
    /** The review email or the ticket bounced. */
    email_bounced: flag,
    email_bounce_reason: text,
    /** Signed in to the MyOtherApp app on a phone: an app notification reaches them. */
    on_app: flag,
  })
  .default({ stage: "confirmed" } as never);

const answerSchema = z.object({
  key: z.string(),
  label: z.string().nullish().transform((v) => v ?? ""),
  value: z.unknown().optional(),
  missing: flag,
});

const ticketSchema = z.object({
  code: text,
  type_name: text,
  admission_no: text,
  pdf_url: text,
  issued_at: text,
  revoked_at: text,
});

const paymentSchema = z.object({
  amount,
  currency: text,
  method: text,
  status: text,
  paid_at: text,
  receipt: text,
});

const checkInSchema = z.object({ at: text, door: text, method: text, by: text });

const printSchema = z.object({
  /** The print request's id, when the server sends it: Retry then retries that one request. */
  id: z.union([z.string(), z.number()]).nullish().catch(null).transform((v) => (v === null || v === undefined ? null : String(v))),
  at: text,
  status: z
    .string()
    .catch("printed")
    .transform((s): PrintState => ((PRINT_STATES as readonly string[]).includes(s) ? (s as PrintState) : "printed")),
  source: text,
  door: text,
  printer: text,
  by: text,
  error: text,
});

const merchSchema = z.object({ item: z.string().catch("Item"), variant: text, at: text, by: text });

const deliverySchema = z.object({
  what: z.string().catch("ticket"),
  channel: text,
  status: text,
  outcome: text,
  at: text,
  reason: text,
});

const timelineSchema = z.object({
  at: z.string(),
  kind: z.string().catch("event"),
  title: z.string().catch(""),
  detail: text,
  by: text,
  tone: z
    .string()
    .catch("default")
    .transform((s): Tone => ((TONES as readonly string[]).includes(s) ? (s as Tone) : "default")),
});

const actionsSchema = z
  .object({
    can_print: flag,
    can_send_to_station: flag,
    printers_online: count,
    can_resend_ticket: flag,
    can_check_in: flag,
    can_undo_check_in: flag,
    can_edit: flag,
    can_confirm: flag,
    can_decline: flag,
    can_ask_missing: flag,
    can_remove: flag,
    /** Write to this guest (email or app notification): whoever may use Messages. */
    can_message: flag,
  })
  .default({} as never);

/** A list the server may leave out, or send with a row this screen cannot read: the readable rows. */
const list = <T extends z.ZodTypeAny>(item: T) =>
  z
    .array(z.unknown())
    .nullish()
    .catch(null)
    .transform((rows) => (rows ?? []).flatMap((r) => { const p = item.safeParse(r); return p.success ? [p.data as z.infer<T>] : []; }));

export const guestProfileSchema = z.object({
  kind: z.string().catch("registration").transform((k) => (k === "request" ? ("request" as const) : ("registration" as const))),
  registration_id: text,
  request_id: text,
  person: personSchema,
  status: statusSchema,
  answers: list(answerSchema),
  ticket: ticketSchema.nullish().catch(null).transform((v) => v ?? null),
  payment: paymentSchema.nullish().catch(null).transform((v) => v ?? null),
  check_in: checkInSchema.nullish().catch(null).transform((v) => v ?? null),
  prints: list(printSchema),
  merch: list(merchSchema),
  deliveries: list(deliverySchema),
  timeline: list(timelineSchema),
  timeline_truncated: flag,
  actions: actionsSchema,
});
export type GuestProfileData = z.infer<typeof guestProfileSchema>;
export type ProfilePrint = GuestProfileData["prints"][number];
export type TimelineRow = GuestProfileData["timeline"][number];
