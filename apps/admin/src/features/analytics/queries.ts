"use client";

import { useQuery } from "@tanstack/react-query";
import { qk } from "@moa/api";

import { staleTimes } from "@moa/app-kit";
import { fetchAdminOverview, fetchPlatformDoors } from "./api";
import type { TopClubSort } from "./overview-schemas";

/**
 * The whole Overview in one query.
 *
 * Replaced the nine-call fan-out of the previous overview (since removed):
 * every figure on the screen comes from a single response, so nothing on the
 * page can describe a different moment from anything else on it.
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

/** Refreshes while a door is open anywhere, so the overview's counts move. */
export function usePlatformDoors() {
  return useQuery({
    queryKey: [...qk.analytics.all, "doors"],
    queryFn: fetchPlatformDoors,
    staleTime: 15_000,
    refetchInterval: (q) => (q.state.data?.live.length ? 15_000 : 60_000),
  });
}
