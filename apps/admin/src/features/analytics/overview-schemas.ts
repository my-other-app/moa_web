import { z } from "zod";

/**
 * `GET /admin/overview` — one response for the whole screen.
 *
 * Parsed rather than trusted: the endpoint returns a bare dict, so FastAPI
 * publishes no schema for it and a shape change would otherwise surface as
 * "NaN" inside a chart rather than one clear error at the boundary.
 */
const point = z.object({ month: z.string().nullable(), value: z.number() });
const labelled = z.object({ label: z.string(), value: z.number() });

export const adminOverviewSchema = z.object({
  generated_at: z.string(),
  period_days: z.number(),

  totals: z.object({
    users: z.number(),
    clubs: z.number(),
    verified_clubs: z.number(),
    pending_clubs: z.number(),
    organisations: z.number(),
    events: z.number(),
    upcoming_events: z.number(),
    past_events: z.number(),
    registrations: z.number(),
    attended: z.number(),
    attendance_rate: z.number(),
    gmv: z.number(),
  }),

  today: z.object({
    events_today: z.number(),
    registrations: z.number(),
    check_ins: z.number(),
    collected: z.number(),
    new_users: z.number(),
  }),

  running: z
    .array(
      z.object({
        id: z.coerce.number(),
        name: z.string(),
        club: z.string().nullable(),
        event_datetime: z.string().nullable(),
        registrations: z.number(),
        has_fee: z.boolean(),
        reg_fee: z.number(),
        is_today: z.boolean(),
      })
    )
    .default([]),

  averages: z.object({
    registrations_per_event: z.number(),
    attendance_rate: z.number(),
    view_to_signup: z.number(),
    average_ticket_price: z.number(),
    revenue_per_paid_event: z.number(),
    followers_per_club: z.number(),
    events_per_club: z.number(),
    average_rating: z.number(),
    page_views: z.number(),
  }),

  growth: z.object({
    users: z.array(point).default([]),
    clubs: z.array(point).default([]),
    events: z.array(point).default([]),
    gmv: z.array(point).default([]),
  }),

  breakdowns: z.object({
    events_by_type: z.array(labelled).default([]),
    clubs_by_organisation: z.array(labelled).default([]),
    users_by_provider: z.array(labelled).default([]),
  }),

  funnel: z
    .array(
      z.object({
        label: z.string(),
        value: z.number(),
        of_previous: z.number().nullable(),
      })
    )
    .default([]),

  top_clubs: z
    .array(
      z.object({
        id: z.coerce.number(),
        name: z.string(),
        organisation: z.string().nullable(),
        followers: z.number(),
        registrations: z.number(),
        revenue: z.number(),
      })
    )
    .default([]),

  /* Folded in so the KPI figure and the chart line come from one response. */
  trends: z.object({
    days: z.number(),
    series: z
      .array(
        z.object({
          date: z.string(),
          users: z.number().default(0),
          events: z.number().default(0),
          registrations: z.number().default(0),
          revenue: z.number().default(0),
        })
      )
      .default([]),
    totals: z.object({
      users: z.number(),
      events: z.number(),
      registrations: z.number(),
      revenue: z.number(),
    }),
    previous_totals: z.object({
      users: z.number(),
      events: z.number(),
      registrations: z.number(),
      revenue: z.number(),
    }),
  }),

  money: z.object({
    captured: z.number(),
    refunded: z.number(),
    net: z.number(),
    failed: z.number(),
    retained_share: z.number(),
    previous_captured: z.number(),
  }),
});

export type AdminOverview = z.infer<typeof adminOverviewSchema>;
export type TopClubSort = "followers" | "registrations" | "revenue";
