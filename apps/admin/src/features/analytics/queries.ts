"use client";

import { useQuery } from "@tanstack/react-query";
import { qk } from "@moa/api";

import { staleTimes } from "@moa/app-kit";
import {
  fetchAdminAnalytics,
  fetchAdminTrends,
  fetchModerationQueue,
  fetchDashboardSignals,
  fetchAdminOverview,
} from "./api";
import type { TopClubSort } from "./overview-schemas";

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

export function useDashboardSignals() {
  return useQuery({
    queryKey: [...qk.analytics.all, "signals"],
    queryFn: fetchDashboardSignals,
    staleTime: staleTimes.analytics,
  });
}

/**
 * The whole Overview in one query.
 *
 * Replaces the nine-call fan-out the previous overview used: every figure on
 * the screen now comes from a single response, so nothing on the page can
 * describe a different moment from anything else on it.
 */
export function useAdminOverview(days: number, topBy: TopClubSort) {
  return useQuery({
    queryKey: [...qk.analytics.all, "overview", days, topBy],
    queryFn: () => fetchAdminOverview(days, topBy),
    staleTime: staleTimes.analytics,
    // Sorting the top-clubs table re-queries; keeping the previous rows on
    // screen stops the whole card collapsing to a skeleton for one column.
    placeholderData: (previous) => previous,
  });
}
