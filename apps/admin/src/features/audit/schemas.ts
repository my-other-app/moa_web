import { paginatedSchema } from "@moa/api";
import { pictureSchema } from "@moa/app-kit";
import { z } from "zod";

/** GET /admin/audit-log — who did what. */
export const auditEntrySchema = z.object({
  id: z.coerce.number(),
  action: z.string(),
  entity_type: z.string().nullish(),
  entity_id: z.string().nullish(),
  summary: z.string().nullish(),
  details: z.record(z.unknown()).nullish(),
  ip_address: z.string().nullish(),
  created_at: z.string(),
  actor: z
    .object({
      id: z.coerce.number().nullish(),
      full_name: z.string().nullish(),
      email: z.string().nullish(),
      /** Their picture, already resolved by the API: a photo, else the avatar they picked. */
      avatar: pictureSchema,
    })
    .nullish(),
});

export const auditPageSchema = paginatedSchema(auditEntrySchema).extend({
  /**
   * The search the API applied (its words, one space apart), or null for
   * none. Absent from an API from before the log could be searched: that
   * is how the page knows not to offer a search box it would ignore.
   */
  search: z.string().nullish(),
});

/** GET /admin/notifications — one row per send, not per recipient. */
export const sentNotificationSchema = z.object({
  title: z.string().nullish(),
  description: z.string().nullish(),
  event_id: z.coerce.number().nullish(),
  event_name: z.string().nullish(),
  club_name: z.string().nullish(),
  sent_count: z.number().default(0),
  read_count: z.number().default(0),
  created_at: z.string().nullish(),
});

export const sentNotificationPageSchema = paginatedSchema(sentNotificationSchema);

export type AuditEntry = z.infer<typeof auditEntrySchema>;
export type SentNotification = z.infer<typeof sentNotificationSchema>;
