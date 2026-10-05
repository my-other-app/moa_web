import { z } from "zod";
import { api } from "@moa/app-kit";
import {
  adminAnalyticsSchema,
  adminTrendsSchema,
  moderationQueueSchema,
  type AdminAnalytics,
  type AdminTrends,
  dashboardSignalsSchema,
  type ModerationQueue,
  type DashboardSignals,
} from "./schemas";

export async function fetchAdminAnalytics(): Promise<AdminAnalytics> {
  const raw = await api.get<unknown>("/api/v1/admin/analytics");
  return adminAnalyticsSchema.parse(raw);
}

export async function fetchAdminTrends(days: number): Promise<AdminTrends> {
  const raw = await api.get<unknown>("/api/v1/admin/analytics/trends", {
    query: { days },
  });
  return adminTrendsSchema.parse(raw);
}

export async function fetchModerationQueue(): Promise<ModerationQueue> {
  const raw = await api.get<unknown>("/api/v1/admin/moderation-queue");
  return moderationQueueSchema.parse(raw);
}

/**
 * One row from a list endpoint, read only for its `total`.
 *
 * `limit: 1` rather than 0 because the pagination helper treats 0 as "use the
 * default", which would fetch a full page to count it.
 */
async function countOf(
  path: string,
  query: Record<string, string | number | boolean> = {}
): Promise<number> {
  const raw = await api.get<unknown>(path, {
    query: { ...query, offset: 0, limit: 1 },
  });
  const parsed = z.object({ total: z.number() }).safeParse(raw);
  return parsed.success ? parsed.data.total : 0;
}

export async function fetchDashboardSignals(): Promise<DashboardSignals> {
  const [
    clubsTotal,
    clubsVerified,
    eventsTotal,
    eventsUpcoming,
    eventsPaid,
    usersTotal,
    usersAdmins,
    usersClubs,
    money,
  ] = await Promise.all([
    countOf("/api/v1/clubs/admin/list"),
    countOf("/api/v1/clubs/admin/list", { is_verified: true }),
    countOf("/api/v1/events/admin/list"),
    countOf("/api/v1/events/admin/list", { is_ended: false }),
    countOf("/api/v1/events/admin/list", { has_fee: true }),
    countOf("/api/v1/user/admin/list"),
    countOf("/api/v1/user/admin/list", { user_type: "admin" }),
    countOf("/api/v1/user/admin/list", { user_type: "club" }),
    api.get<unknown>("/api/v1/payments/admin/totals"),
  ]);

  const totals = z
    .object({
      captured_total: z.number().default(0),
      refunded_total: z.number().default(0),
      net_total: z.number().default(0),
      failed_count: z.number().default(0),
    })
    .safeParse(money);

  return dashboardSignalsSchema.parse({
    clubs: {
      total: clubsTotal,
      verified: clubsVerified,
      // Derived rather than fetched: `is_verified=false` would be a tenth
      // request for a number the first two already determine.
      pending: Math.max(0, clubsTotal - clubsVerified),
    },
    events: {
      total: eventsTotal,
      upcoming: eventsUpcoming,
      past: Math.max(0, eventsTotal - eventsUpcoming),
      paid: eventsPaid,
    },
    users: {
      total: usersTotal,
      admins: usersAdmins,
      clubAccounts: usersClubs,
    },
    money: {
      captured: totals.success ? totals.data.captured_total : 0,
      refunded: totals.success ? totals.data.refunded_total : 0,
      net: totals.success ? totals.data.net_total : 0,
      failed: totals.success ? totals.data.failed_count : 0,
    },
  });
}
