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

export const sendAnnouncementSchema = z.object({
  title: z.string().trim().min(3, "Give the announcement a title").max(120),
  body: z.string().trim().min(5, "Write a message").max(1000),
});

export type Announcement = z.infer<typeof announcementSchema>;
export type SendAnnouncementInput = z.infer<typeof sendAnnouncementSchema>;
