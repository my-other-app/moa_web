import { api } from "@moa/app-kit";
import {
  adminAnalyticsSchema,
  adminTrendsSchema,
  moderationQueueSchema,
  type AdminAnalytics,
  type AdminTrends,
  type ModerationQueue,
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
