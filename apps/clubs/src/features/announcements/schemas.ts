import { z } from "zod";

export const announcementSchema = z
  .object({
    id: z.coerce.number().nullish(),
    title: z.string().nullish(),
    body: z.string().nullish(),
    message: z.string().nullish(),
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
