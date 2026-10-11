import { z } from "zod";

export const contactSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  role: z.string(),
  attended: z.boolean(),
  event_id: z.number(),
  event_name: z.string(),
  event_ended_at: z.string().nullable(),
  archived_at: z.string().nullable(),
});
export type Contact = z.infer<typeof contactSchema>;

export const contactsPageSchema = z.object({
  items: z.array(contactSchema),
  total: z.number(),
  page: z.number(),
  page_size: z.number(),
  groups: z.array(z.object({ event_id: z.number(), event_name: z.string(), event_ended_at: z.string().nullable(), archived_at: z.string().nullable(), contacts: z.number() })),
});
export type ContactsPage = z.infer<typeof contactsPageSchema>;

export interface ContactsQuery {
  q?: string;
  eventId?: number;
  attended?: boolean;
  page?: number;
  pageSize?: number;
}
