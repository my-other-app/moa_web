"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { nullIfRouteMissing } from "@moa/api";

import { fetchGamesOverview } from "./api";
import type { GamesRange } from "./schemas";

/** Refreshes every 15 s while the tab is visible, so "connected now" stays current. */
export function useGamesOverview(range: GamesRange) {
  return useQuery({
    queryKey: ["admin", "games", "overview", range.from, range.to],
    queryFn: () => nullIfRouteMissing(() => fetchGamesOverview(range)),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
}
