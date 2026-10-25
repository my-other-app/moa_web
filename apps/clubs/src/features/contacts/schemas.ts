import { z } from "zod";

/** One guest close-out kept for the club: the four fields it asked to keep, and the event they came from. */
export const contactSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable().catch(null),
  phone: z.string().nullable().catch(null),
  role: z.string().catch("attendee"),
  attended: z.boolean().catch(false),
  event_id: z.number(),
  event_name: z.string(),
  event_ended_at: z.string().nullable().catch(null),
  archived_at: z.string().nullable().catch(null),
});
export type Contact = z.infer<typeof contactSchema>;

/** Contacts arrive one event's close-out at a time; the event is what the club filters by. */
export const contactGroupSchema = z.object({
  event_id: z.number(),
  event_name: z.string(),
  event_ended_at: z.string().nullable().catch(null),
  archived_at: z.string().nullable().catch(null),
  contacts: z.number(),
});
export type ContactGroup = z.infer<typeof contactGroupSchema>;

export const contactsPageSchema = z.object({
  items: z.array(contactSchema).default([]),
  total: z.number(),
  page: z.number(),
  page_size: z.number(),
  groups: z.array(contactGroupSchema).default([]),
});
export type ContactsPage = z.infer<typeof contactsPageSchema>;

export interface ContactFilters {
  q?: string;
  event_id?: number | null;
  attended?: boolean | null;
  /** YYYY-MM-DD, on the event's end. */
  since?: string;
  until?: string;
}

export const PAGE_SIZE = 50;
