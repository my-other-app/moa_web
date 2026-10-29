import { paginatedSchema } from "@moa/api";
import { EVENT_STATUSES, cohostLogoSchema, cohostsField, imageFieldSchema, linkedInterestSchema, namedRefSchema, topicRefsField, type EventLifecycle } from "@moa/app-kit";
import { z } from "zod";

export { EVENT_STATUSES, type EventLifecycle };

/** The status clock, tolerant of a payload cached from before it existed. */
const lifecycleSchema = z.enum(EVENT_STATUSES).catch("published");

/**
 * Co-hosted events (features/cohosts): whether the signed-in club hosts the
 * event or co-hosts it. Null from a server before co-hosts, where every
 * event is the club's own.
 */
const viewerRoleField = z.enum(["host", "cohost"]).nullish().catch(null).transform((v) => v ?? null);

/** The event's own club, the host: what the co-host screens name and link. */
const hostClubSchema = z.object({ id: z.coerce.number(), name: z.string(), slug: z.string().nullish(), logo: cohostLogoSchema });

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
  merch_enabled: z.boolean().nullish(),
  swag_enabled: z.boolean().nullish(),
  page_views: z.number().nullish(),
  registration_count: z.number().nullish(),
  attended_count: z.number().nullish(),
  status: lifecycleSchema,
  // What the organiser checks the row for; absent from a payload cached before they existed.
  checked_in: z.number().catch(0),
  max_participants: z.number().nullish(),
  collected: z.number().catch(0),
  outstanding: z.number().catch(0),
  door_open: z.boolean().catch(false),
  registration_open: z.boolean().catch(false),
  ends_at: z.string().nullish(),
  /**
   * Confirm each registration: the event asks people to wait for the club,
   * how many wait now and how many ever asked. Absent from an older server:
   * off, and the counts unknown (null), so nothing about requests shows.
   */
  requires_approval: z.boolean().catch(false),
  requests_pending: z.number().nullish().catch(null).transform((v) => (v === null || v === undefined ? null : Math.max(0, Math.trunc(v)))),
  requests_total: z.number().nullish().catch(null).transform((v) => (v === null || v === undefined ? null : Math.max(0, Math.trunc(v)))),
  /**
   * Co-hosted events: the host club, its accepted co-hosts, and whether this
   * club hosts the row or co-hosts it. Absent from an older server (null):
   * every row is the club's own.
   */
  club: hostClubSchema.nullish().catch(null),
  cohosts: cohostsField,
  viewer_role: viewerRoleField,
});

export const clubEventPageSchema = paginatedSchema(clubEventSchema);

export const EVENT_SCOPES = ["upcoming", "now", "draft", "past", "all"] as const;
export type EventScope = (typeof EVENT_SCOPES)[number];
export const EVENT_SORTS = ["soonest", "latest", "registered", "viewed"] as const;
export type EventSort = (typeof EVENT_SORTS)[number];
/** GET /clubs/events/list?role=: the club's own events, the ones it co-hosts, or both (the default). */
export const EVENT_ROLE_FILTERS = ["all", "hosted", "cohosted"] as const;
export type EventRoleFilter = (typeof EVENT_ROLE_FILTERS)[number];

const attentionRef = z.object({ id: z.number(), name: z.string(), at: z.string().nullish() });

/** GET /clubs/events/figures — the season above the list. */
export const eventsFiguresSchema = z.object({
  upcoming: z.number(),
  next_event: z.object({ id: z.number(), name: z.string(), starts_at: z.string() }).nullish(),
  registered: z.number(),
  capacity: z.number().nullish(),
  collected: z.number(),
  outstanding: z.number(),
  attention: z.object({
    closing_soon: z.array(attentionRef).default([]),
    doors_open: z.array(attentionRef).default([]),
    unmarked: z.array(attentionRef).default([]),
    stale_drafts: z.array(attentionRef).default([]),
    /** Events with registration requests waiting for the club ("Confirm each registration"); absent from an API without them. */
    requests_pending: z.array(z.object({ id: z.number(), name: z.string(), count: z.number() })).catch([]).default([]),
  }),
  past: z.number(),
  drafts: z.number(),
  /** Upcoming events this club co-hosts (counted in `upcoming` too); null from a server before co-hosts. */
  cohosted_upcoming: z.number().nullish().catch(null).transform((v) => v ?? null),
  generated_at: z.string(),
});
export type EventsFigures = z.infer<typeof eventsFiguresSchema>;

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
    // Declared rather than left to .passthrough(), which types unknown keys as
    // `unknown`. The reviews panel needs the event's own average, and an
    // undeclared key cannot be read without casting.
    rating: z.number().nullish(),
    total_rating: z.coerce.number().nullish(),
    // The console header names the club (the host) and reads the status clock.
    club: hostClubSchema.nullish(),
    /**
     * Co-hosted events: the accepted co-hosts, and whether the signed-in
     * club hosts or co-hosts the event. Both null from a server before
     * co-hosts, where every co-host screen stays hidden.
     */
    cohosts: cohostsField,
    viewer_role: viewerRoleField,
    status: lifecycleSchema,
    status_clock: z.boolean().catch(true),
    retention_mode: z.string().catch("keep"),
    max_participants: z.coerce.number().nullish(),
    has_fee: z.boolean().nullish(),
    reg_fee: z.coerce.number().nullish(),
    about: z.string().nullish(),
    created_at: z.string().nullish(),
    /**
     * The server's word on whether this event keeps what it was made with
     * under plan enforcement (made before the cutoff, within its date
     * window). Grandfathered, no event-scoped lock applies to it. Absent on
     * an older server: not grandfathered.
     */
    plan_grandfathered: z.boolean().catch(false),
    /**
     * Whose Razorpay this event's ticket payments land in: the club's own
     * account, or MyOtherApp's. Absent on an older server (null): the edit
     * form then works it out from the club's gateway.
     */
    payments_to: z.enum(["club", "platform"]).nullish().catch(null),
    /**
     * Confirm each registration: people who fill the form wait until the
     * club confirms them (the Requests tab). Absent on an older server: off.
     */
    requires_approval: z.boolean().catch(false),
    /** The "High demand" tag on the public page (no numbers); absent from an older server: null. */
    high_demand_label: z.boolean().nullish().catch(null),
    /** What it is about, for the Overview: its interests, and the topics they fall under (null from a server before topics). */
    interests: z.array(linkedInterestSchema).catch([]).default([]),
    topics: topicRefsField,
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
