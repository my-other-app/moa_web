import { z } from "zod";

export const agendaItemSchema = z.object({
  id: z.string(),
  event_id: z.number(),
  starts_at: z.string(),
  ends_at: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  speaker: z.string().nullable(),
  speaker_photo_key: z.string().nullable(),
  speaker_photo_url: z.string().nullable(),
  location: z.string().nullable(),
  sort_order: z.number(),
  /** Two blocks are parallel when their times overlap. */
  parallel: z.boolean(),
});
export type AgendaItem = z.infer<typeof agendaItemSchema>;

export const agendaSchema = z.object({
  items: z.array(agendaItemSchema),
  timezone: z.string(),
  /** Whether a programme design has been saved; the kiosk shows it only then. */
  has_programme: z.boolean(),
});
export type Agenda = z.infer<typeof agendaSchema>;

export interface AgendaItemInput {
  starts_at: string;
  ends_at: string | null;
  title: string;
  description: string | null;
  speaker: string | null;
  location: string | null;
}

/** A time as the agenda prints it, in the event's zone. */
export const agendaTime = (iso: string, tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
export const agendaDay = (iso: string, tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
export const dayOf = (iso: string, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
