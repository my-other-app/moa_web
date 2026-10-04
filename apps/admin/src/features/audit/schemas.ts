import { paginatedSchema } from "@moa/api";
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
    })
    .nullish(),
});

export const auditPageSchema = paginatedSchema(auditEntrySchema);

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
