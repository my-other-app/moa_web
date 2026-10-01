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
export type GrowthPoint = z.infer<typeof growthPointSchema>;
