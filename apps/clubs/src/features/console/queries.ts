"use client";

import { useQuery } from "@tanstack/react-query";
import { qk } from "@moa/api";

import { fetchEventFigures, fetchEventSummary } from "./api";

/** Fifteen seconds: the door moves faster than a minute, slower than a scan. */
const LIVE_INTERVAL = 15_000;

/**
 * The live summary. While the door is open it refreshes on its own so the
 * counter rolls; once the door is shut, nothing is moving and it stops.
 */
export function useEventSummary(eventId: number) {
  return useQuery({
    queryKey: [...qk.events.detail(eventId), "summary"],
    queryFn: () => fetchEventSummary(eventId),
    enabled: eventId > 0,
    staleTime: 10_000,
    refetchInterval: (q) => (q.state.data?.door_open ? LIVE_INTERVAL : false),
  });
}

export function useEventFigures(eventId: number) {
  return useQuery({
    queryKey: [...qk.events.detail(eventId), "figures"],
    queryFn: () => fetchEventFigures(eventId),
    enabled: eventId > 0,
    staleTime: 30_000,
  });
}
