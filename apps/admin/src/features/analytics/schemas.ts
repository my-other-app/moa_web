import { z } from "zod";

/**
 * /admin/analytics returns a bare dict, so FastAPI publishes no schema for it
 * (the OpenAPI entry is just `{"type": "object"}`). Validating here gives the
 * UI a real type and turns a backend shape change into one clear error at the
 * boundary instead of `undefined` rendering as "NaN" inside a chart.
 */
export const growthPointSchema = z.object({
  name: z.string(),
  users: z.number(),
});

export const adminAnalyticsSchema = z.object({
  total_users: z.number(),
  total_users_delta: z.string().nullish(),
  verified_clubs: z.number(),
  verified_clubs_delta: z.string().nullish(),
  events_hosted: z.number(),
  events_hosted_delta: z.string().nullish(),
  platform_revenue: z.number(),
  platform_revenue_delta: z.string().nullish(),
  user_growth_data: z.array(growthPointSchema).default([]),
});

export type AdminAnalytics = z.infer<typeof adminAnalyticsSchema>;

/** GET /admin/analytics/trends — one point per day, plus the prior window. */
export const trendPointSchema = z.object({
  date: z.string(),
  users: z.number().default(0),
  events: z.number().default(0),
  registrations: z.number().default(0),
  revenue: z.number().default(0),
});

const trendTotalsSchema = z.object({
  users: z.number().default(0),
  events: z.number().default(0),
  registrations: z.number().default(0),
  revenue: z.number().default(0),
});

export const adminTrendsSchema = z.object({
  days: z.number(),
  series: z.array(trendPointSchema).default([]),
  totals: trendTotalsSchema,
  previous_totals: trendTotalsSchema,
});

export type AdminTrends = z.infer<typeof adminTrendsSchema>;
export type TrendMetric = keyof z.infer<typeof trendTotalsSchema>;

/** GET /admin/moderation-queue. */
export const moderationQueueSchema = z.object({
  pending_clubs: z
    .array(
      z.object({
        id: z.coerce.number(),
        name: z.string(),
        created_at: z.string().nullish(),
      })
    )
    .default([]),
  events_without_attendance: z
    .array(
      z.object({
        id: z.coerce.number(),
        name: z.string(),
        event_datetime: z.string().nullish(),
        registration_count: z.number().default(0),
      })
    )
    .default([]),
});

export type ModerationQueue = z.infer<typeof moderationQueueSchema>;

/**
 * Composite read for the dashboard's composition panels.
 *
 * There is no single endpoint behind this. It is assembled from the admin list
 * endpoints, each asked for one row purely to read its `total`, plus the
 * payment totals. That keeps the dashboard working against the API as deployed
 * rather than waiting on a new endpoint, at the cost of a fan-out that the
 * query cache collapses to once a minute.
 */
export const dashboardSignalsSchema = z.object({
  clubs: z.object({
    total: z.number(),
    verified: z.number(),
    pending: z.number(),
  }),
  events: z.object({
    total: z.number(),
    upcoming: z.number(),
    past: z.number(),
    paid: z.number(),
  }),
  users: z.object({
    total: z.number(),
    admins: z.number(),
    clubAccounts: z.number(),
  }),
  money: z.object({
    captured: z.number(),
    refunded: z.number(),
    net: z.number(),
    failed: z.number(),
  }),
});

export type DashboardSignals = z.infer<typeof dashboardSignalsSchema>;
