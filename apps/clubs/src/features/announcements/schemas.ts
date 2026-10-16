import { z } from "zod";

export const announcementSchema = z
  .object({
    /*
     * A string: the history endpoint mints "{event_id}-{index}" per grouped
     * send. Coercing it to a number gave NaN, which zod refuses, so the whole
     * page failed to load for any club that had ever sent an announcement.
     */
    id: z.union([z.string(), z.number()]).nullish(),
    title: z.string().nullish(),
    /* The text comes back as `description`; `body` and `message` are older names. */
    description: z.string().nullish(),
    body: z.string().nullish(),
    message: z.string().nullish(),
    read_count: z.number().nullish(),
    event_id: z.coerce.number().nullish(),
    event_name: z.string().nullish(),
    created_at: z.string().nullish(),
    sent_count: z.number().nullish(),
  })
  .passthrough();

/**
 * GET /clubs/notifications/history returns `{ items, total }` only -- it does
 * not carry the limit/offset that PaginatedResponse does, so this cannot reuse
 * paginatedSchema.
 */
export const announcementHistorySchema = z.object({
  items: z.array(announcementSchema).default([]),
  total: z.number().default(0),
});

export const AUDIENCES = [
  { value: "all", label: "Everyone registered" },
  { value: "attendees", label: "Only those who checked in" },
  { value: "non_attendees", label: "Only those who have not checked in" },
] as const;

/** What the send endpoint answers; a refusal comes back as 200 with success false. */
export const sendAnnouncementResultSchema = z.object({
  success: z.boolean().default(true),
  message: z.string().nullish(),
  notifications_sent: z.number().nullish(),
});

export const sendAnnouncementSchema = z.object({
  title: z.string().trim().min(3, "Give the announcement a title").max(120),
  body: z.string().trim().min(5, "Write a message").max(1000),
  audience: z.enum(["all", "attendees", "non_attendees"]).default("all"),
});

export type Announcement = z.infer<typeof announcementSchema>;
export type SendAnnouncementInput = z.infer<typeof sendAnnouncementSchema>;

// --- the Announcements page ----------------------------------------------------------------------

export const PUSH_SCOPES = ["all", "announcements", "live_updates"] as const;
export type PushScope = (typeof PUSH_SCOPES)[number];
export const PUSH_SCOPE_LABEL: Record<PushScope, string> = { all: "Everything", announcements: "Announcements", live_updates: "Live updates" };
export const AUDIENCE_LABEL: Record<string, string> = { all: "Everyone registered", attendees: "Checked in", non_attendees: "Not checked in", checked_in: "Checked in", registered: "Everyone registered" };

export const pushSendSchema = z.object({
  id: z.string(),
  kind: z.enum(["announcement", "live_update"]).catch("announcement"),
  title: z.string(),
  body: z.string(),
  event_id: z.number().nullish(),
  event: z.object({ id: z.number(), name: z.string(), starts_at: z.string().nullish() }).nullish(),
  audience: z.string().nullish(),
  sent: z.number(),
  read: z.number(),
  read_quickly: z.number(),
  read_pct: z.number(),
  slot: z.string(),
  created_at: z.string(),
});
export type PushSend = z.infer<typeof pushSendSchema>;

export const pushHistoryPageSchema = z.object({ items: z.array(pushSendSchema), total: z.number(), limit: z.number(), offset: z.number(), counts: z.record(z.number()).default({}) });

export const pushInsightsSchema = z.object({
  sends: z.number(),
  sends_delta: z.number().nullish(),
  reached: z.number(),
  reached_delta: z.number().nullish(),
  open_rate: z.number().nullish(),
  open_rate_prev: z.number().nullish(),
  quick_rate: z.number().nullish(),
  last_sent_at: z.string().nullish(),
  best: z.object({ id: z.string(), title: z.string(), read_pct: z.number(), sent: z.number() }).nullish(),
  slots: z.array(z.object({ key: z.string(), label: z.string(), sends: z.number(), open_rate: z.number().nullish() })),
  best_slot: z.string().nullish(),
  coming: z.array(z.object({ id: z.number(), name: z.string(), starts_at: z.string().nullish(), registered: z.number(), reachable: z.number() })),
  registered_ahead: z.number(),
  reachable_ahead: z.number(),
  all_time: z.object({ sends: z.number(), reached: z.number(), opened: z.number() }),
  generated_at: z.string(),
});
export type PushInsights = z.infer<typeof pushInsightsSchema>;

const reach = z.object({ people: z.number(), reachable: z.number() });
export const pushAudienceSchema = z.object({
  event: z.object({ id: z.number(), name: z.string(), starts_at: z.string().nullish() }),
  registered: z.number(),
  checked_in: z.number(),
  reachable: z.number(),
  by_audience: z.object({ all: reach, attendees: reach, non_attendees: reach }),
});
export type PushAudience = z.infer<typeof pushAudienceSchema>;
