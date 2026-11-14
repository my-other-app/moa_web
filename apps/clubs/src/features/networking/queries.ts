"use client";

import { useQuery } from "@tanstack/react-query";
import { nullIfRouteMissing, qk } from "@moa/api";

import { fetchNetworkingStats } from "./api";

/** A minute: networking moves slower than the door, and these are counts, not a feed. */
export const NETWORKING_POLL_MS = 60_000;

export const networkingStatsKey = (eventId: number) => [...qk.events.detail(eventId), "networking-stats"] as const;

/**
 * The event's networking counts. While the event is live they are read
 * again every minute, and only while the tab is visible (React Query holds
 * an interval while the page is hidden); otherwise once. An API without
 * the route answers null, and the card stays away.
 */
export function useNetworkingStats(eventId: number, live: boolean) {
  return useQuery({
    queryKey: networkingStatsKey(eventId),
    queryFn: () => nullIfRouteMissing(() => fetchNetworkingStats(eventId)),
    enabled: eventId > 0,
    staleTime: NETWORKING_POLL_MS / 2,
    retry: false,
    refetchInterval: live ? NETWORKING_POLL_MS : false,
    refetchIntervalInBackground: false,
  });
}
