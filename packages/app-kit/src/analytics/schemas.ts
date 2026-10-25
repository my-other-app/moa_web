import { z } from "zod";

/**
 * The figures endpoints, parsed at the boundary.
 *
 * Shared between the clubs app (its event console and dashboard) and the
 * admin app (its event and club pages, its overview), so the two can never
 * disagree about what a bucket or a door looks like.
 */

export const arrivalBucketSchema = z.object({
  starts_at: z.string(),
  admits: z.number(),
  cumulative: z.number(),
});

export const doorFiguresSchema = z.object({
  door_id: z.string().nullable(),
  name: z.string(),
  kind: z.string(),
  admits: z.number(),
  share_pct: z.number(),
  last_admit_at: z.string().nullable(),
  peak_admits: z.number(),
});

export const typeFiguresSchema = z.object({
  role: z.string(),
  label: z.string(),
  color: z.string(),
  registered: z.number(),
  checked_in: z.number(),
});

export const deliveryFiguresSchema = z.object({
  channel: z.string(),
  sent: z.number(),
  failed: z.number(),
  skipped: z.number(),
  pending: z.number(),
});

export const viaFiguresSchema = z.object({
  via: z.string(),
  label: z.string(),
  admits: z.number(),
});

export const eventFiguresSchema = z.object({
  total_admitted: z.number(),
  arrivals: z.array(arrivalBucketSchema).default([]),
  by_door: z.array(doorFiguresSchema).default([]),
  by_type: z.array(typeFiguresSchema).default([]),
  deliveries: z.array(deliveryFiguresSchema).default([]),
  via: z.array(viaFiguresSchema).default([]),
  cards: z.object({ printed: z.number(), failed: z.number(), holders: z.number() }),
  timing: z.object({
    first_admit_at: z.string().nullable(),
    last_admit_at: z.string().nullable(),
    peak_starts_at: z.string().nullable(),
    peak_admits: z.number(),
    half_house_at: z.string().nullable(),
    half_house_minutes: z.number().nullable(),
  }),
  contacts: z.object({ phone: z.number(), email: z.number(), bounced: z.number() }),
});

export type EventFigures = z.infer<typeof eventFiguresSchema>;

/** `cancelled` is set only by cancelling the event (POST /events/{id}/cancel), and is final. */
export const EVENT_STATUSES = ["draft", "published", "live", "closed", "archived", "cancelled"] as const;
export type EventLifecycle = (typeof EVENT_STATUSES)[number];

export const recentCheckInSchema = z.object({
  id: z.string(),
  name: z.string(),
  door: z.string(),
  by: z.string().nullable(),
  via: z.string(),
  checked_in_at: z.string(),
});

export const eventSummarySchema = z.object({
  event_id: z.number(),
  status: z.enum(EVENT_STATUSES).catch("published"),
  status_clock: z.boolean(),
  door_open: z.boolean(),
  starts_at: z.string(),
  ends_at: z.string(),
  timezone: z.string(),
  capacity: z.number().nullable(),
  registered: z.number(),
  checked_in: z.number(),
  recent: z.array(recentCheckInSchema).default([]),
  by_source: z.array(z.object({ source: z.string(), label: z.string(), registered: z.number(), checked_in: z.number() })).default([]),
  merch: z.array(z.object({ item_id: z.string(), name: z.string(), collected: z.number(), total: z.number() })).default([]),
  tickets: z.object({
    issued: z.number(),
    missing: z.number(),
    pending: z.number(),
    older_design: z.number(),
    revoked: z.number(),
    design_version: z.number(),
  }),
  retention: z.object({ mode: z.string(), state: z.string().nullable(), run_at: z.string().nullable() }),
  analytics: eventFiguresSchema,
  from_report: z.boolean(),
  generated_at: z.string(),
});

export type EventSummary = z.infer<typeof eventSummarySchema>;
export type RecentCheckIn = z.infer<typeof recentCheckInSchema>;

export const attentionItemSchema = z.object({
  kind: z.string(),
  tone: z.enum(["red", "amber"]).catch("amber"),
  title: z.string(),
  body: z.string(),
  event_id: z.number().nullable(),
});

export const liveEventSchema = z.object({
  event_id: z.number(),
  name: z.string(),
  club: z.string().nullable(),
  registered: z.number(),
  checked_in: z.number(),
  gates: z.array(z.string()).default([]),
  volunteers: z.number(),
  door_open: z.boolean(),
  starts_at: z.string(),
});

export const dashboardStatsSchema = z.object({
  events: z.object({
    total: z.number(),
    draft: z.number(),
    published: z.number(),
    live: z.number(),
    closed: z.number(),
    archived: z.number(),
  }),
  on_file: z.number(),
  retention_due: z.number(),
  next_retention_at: z.string().nullable(),
  doors_open: z.number(),
});

export const clubDashboardSchema = z.object({
  stats: dashboardStatsSchema,
  attention: z.array(attentionItemSchema).default([]),
  live: z.array(liveEventSchema).default([]),
  generated_at: z.string(),
});

export const platformDoorsSchema = clubDashboardSchema.extend({ clubs_live: z.number() });

export const clubLifetimeSchema = z.object({
  events_run: z.number(),
  registered: z.number(),
  guests_admitted: z.number(),
  average_turnout_pct: z.number().nullable(),
  reports_delivered: z.number(),
});

export type AttentionItem = z.infer<typeof attentionItemSchema>;
export type LiveEvent = z.infer<typeof liveEventSchema>;
export type ClubDashboard = z.infer<typeof clubDashboardSchema>;
export type PlatformDoors = z.infer<typeof platformDoorsSchema>;
export type ClubLifetime = z.infer<typeof clubLifetimeSchema>;

/** Where each attention item leads: the page where the decision is made. */
export function attentionPath(item: AttentionItem): string | null {
  if (item.event_id === null) return null;
  switch (item.kind) {
    case "RETENTION_FAILED":
    case "NO_RECIPIENTS":
    case "DRAFT_STARTED":
      return `/events/${item.event_id}/closeout`;
    case "BOUNCED":
    case "TICKETS_MISSING":
    case "REDESIGNED_AFTER_ISSUE":
      return `/events/${item.event_id}/attendees`;
    default:
      return `/events/${item.event_id}`;
  }
}
