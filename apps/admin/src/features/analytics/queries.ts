"use client";

import { useQuery } from "@tanstack/react-query";
import { qk } from "@moa/api";

import { staleTimes } from "@moa/app-kit";
import {
  fetchAdminAnalytics,
  fetchAdminTrends,
  fetchModerationQueue,
} from "./api";

export function useAdminAnalytics() {
  return useQuery({
    queryKey: qk.analytics.dashboard(),
    queryFn: fetchAdminAnalytics,
    staleTime: staleTimes.analytics,
  });
}

export function useAdminTrends(days: number) {
  return useQuery({
    queryKey: [...qk.analytics.all, "trends", days],
    queryFn: () => fetchAdminTrends(days),
    staleTime: staleTimes.analytics,
  });
}

export function useModerationQueue() {
  return useQuery({
    queryKey: [...qk.analytics.all, "moderation-queue"],
    queryFn: fetchModerationQueue,
    staleTime: staleTimes.volatile,
  });
}
