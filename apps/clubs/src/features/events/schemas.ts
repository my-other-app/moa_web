import { paginatedSchema } from "@moa/api";
import { imageFieldSchema, namedRefSchema } from "@moa/app-kit";
import { z } from "zod";

/** GET /clubs/events/list — the signed-in club's own events. */
export const clubEventSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  slug: z.string().nullish(),
  poster: imageFieldSchema,
  event_datetime: z.string().nullish(),
  duration: z.number().nullish(),
  location_name: z.string().nullish(),
  has_fee: z.boolean().default(false),
  reg_fee: z.number().nullish(),
  has_prize: z.boolean().default(false),
  prize_amount: z.number().nullish(),
  is_online: z.boolean().nullish(),
  reg_startdate: z.string().nullish(),
  reg_enddate: z.string().nullish(),
  category: namedRefSchema,
  page_views: z.number().nullish(),
  registration_count: z.number().nullish(),
  attended_count: z.number().nullish(),
});

export const clubEventPageSchema = paginatedSchema(clubEventSchema);

export type ClubEvent = z.infer<typeof clubEventSchema>;

/**
 * GET /events/info/{id}, narrowed to what the detail header renders.
 *
 * Deliberately not the edit form's parser: that one maps the whole payload
 * into form values. This only needs the poster, the name and the dates the
 * status card is derived from, and `passthrough` keeps the rest of the
 * response available to anything sharing the cache entry.
 */
export const eventDetailSchema = z
  .object({
    id: z.coerce.number(),
    name: z.string(),
    slug: z.string().nullish(),
    poster: imageFieldSchema,
    event_datetime: z.string().nullish(),
    duration: z.coerce.number().nullish(),
    reg_startdate: z.string().nullish(),
    reg_enddate: z.string().nullish(),
    location_name: z.string().nullish(),
    is_online: z.boolean().nullish(),
    page_views: z.coerce.number().nullish(),
  })
  .passthrough();

export type EventDetail = z.infer<typeof eventDetailSchema>;

export type EventStatus = "live" | "closed" | "ended";

/**
 * Where the event is in its lifecycle.
 *
 * The API has no status field, so it is derived. "ended" wins over "closed"
 * because an organiser reading "Registration closed" about an event that
 * finished last month would be told the less useful of two true things.
 */
export function eventStatus(
  event: Pick<EventDetail, "event_datetime" | "duration" | "reg_enddate">,
  now: Date = new Date()
): EventStatus {
  if (event.event_datetime) {
    const start = new Date(event.event_datetime);
    if (!Number.isNaN(start.getTime())) {
      // `duration` is minutes; an event with none is treated as a point in time.
      const end = new Date(start.getTime() + (event.duration ?? 0) * 60_000);
      if (end < now) return "ended";
    }
  }
  if (!event.reg_enddate) return "live";
  const regEnd = new Date(event.reg_enddate);
  if (Number.isNaN(regEnd.getTime())) return "live";
  return regEnd > now ? "live" : "closed";
}
