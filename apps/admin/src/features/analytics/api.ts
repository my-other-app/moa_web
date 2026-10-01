import { api } from "@moa/app-kit";
import { adminAnalyticsSchema, type AdminAnalytics } from "./schemas";

export async function fetchAdminAnalytics(): Promise<AdminAnalytics> {
  const raw = await api.get<unknown>("/api/v1/admin/analytics");
  return adminAnalyticsSchema.parse(raw);
}
