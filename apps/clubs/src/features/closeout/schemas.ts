import { z } from "zod";

export const EVENT_STATUSES = ["draft", "published", "live", "closed", "archived"] as const;
export type LifecycleStatus = (typeof EVENT_STATUSES)[number];

export const closeoutSettingsSchema = z.object({
  status: z.enum(EVENT_STATUSES),
  status_clock: z.boolean(),
  retention_mode: z.enum(["keep", "delete"]),
  retention_hours: z.number(),
  report_recipients: z.array(z.string()),
  keep_contacts: z.boolean(),
  starts_at: z.string(),
  ends_at: z.string(),
  statuses: z.array(z.object({ key: z.enum(EVENT_STATUSES), label: z.string(), note: z.string() })),
});
export type CloseoutSettings = z.infer<typeof closeoutSettingsSchema>;

export const figuresSchema = z
  .object({
    event_name: z.string(),
    org_name: z.string(),
    venue: z.string().nullable(),
    starts_at: z.string(),
    ends_at: z.string(),
    registered: z.number(),
    checked_in: z.number(),
    turnout_pct: z.number(),
    no_shows: z.number(),
    by_role: z.array(z.object({ role: z.string(), label: z.string(), registered: z.number(), checked_in: z.number() })),
    by_via: z.array(z.object({ via: z.string(), label: z.string(), count: z.number() })),
    walk_ins: z.number(),
    with_phone: z.number(),
    merch: z.array(z.object({ name: z.string(), collected: z.number(), total: z.number() })),
    messages: z.array(z.object({ subject: z.string().nullable(), audience: z.string(), sent: z.number(), failed: z.number(), skipped: z.number() })),
    certificates_issued: z.number(),
    cards_printed: z.number(),
    rating_avg: z.number(),
    rating_count: z.number(),
  })
  .passthrough();
export type Figures = z.infer<typeof figuresSchema>;

export const reportSchema = z.object({ id: z.string(), filename: z.string(), figures: z.record(z.unknown()), generated_at: z.string(), generated_by_name: z.string().nullable(), delivered_to: z.array(z.string()) });
export type CloseoutReport = z.infer<typeof reportSchema>;

export const RETENTION_STATES = ["pending", "report_sent", "deleted", "failed"] as const;
export const retentionStatusSchema = z.object({
  event_id: z.number(),
  mode: z.enum(["keep", "delete"]),
  state: z.enum(RETENTION_STATES),
  run_at: z.string(),
  attempts: z.number(),
  last_error: z.string().nullable(),
  refusal: z.string().nullable(),
  refused_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  deleted: z.record(z.number()).nullable(),
  recipients: z.array(z.string()),
  preview: z.record(z.number()),
  keeps_contacts: z.boolean(),
  contacts_kept: z.number(),
  ended: z.boolean(),
  ends_at: z.string(),
});
export type RetentionStatus = z.infer<typeof retentionStatusSchema>;

export const runResultSchema = z.object({ state: z.enum(RETENTION_STATES), refusal: z.string().nullable(), error: z.string().nullable(), deleted: z.record(z.number()).nullable() });

export interface SettingsPatch {
  status?: LifecycleStatus;
  status_clock?: boolean;
  retention_mode?: "keep" | "delete";
  retention_hours?: number;
  report_recipients?: string[];
  keep_contacts?: boolean;
}

export const PREVIEW_LABEL: Record<string, string> = {
  registrations: "registrations stay (they belong to the guests' accounts)",
  walkups: "walk-up records made at the gate",
  phones: "phone numbers",
  answers: "answers to the event's own fields",
  deliveries: "ticket and certificate delivery logs",
  message_deliveries: "message delivery logs",
  self_check_in_sessions: "phone check-in sessions",
  contacts_archived: "contacts kept for the club",
};
