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
