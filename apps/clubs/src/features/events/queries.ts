"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { qk } from "@moa/api";

import { fetchClubEvents, fetchEventDetail, fetchEventsFigures, type ClubEventQuery } from "./api";
import { eventDetailSchema } from "./schemas";

export function useClubEvents(query: ClubEventQuery) {
  return useQuery({
    queryKey: qk.events.list(query),
    queryFn: () => fetchClubEvents(query),
    placeholderData: keepPreviousData,
  });
}

/** The season above the list; refreshed once a minute so the countdown and the waits stay honest. */
export function useEventsFigures() {
  return useQuery({ queryKey: [...qk.events.all, "figures"], queryFn: fetchEventsFigures, staleTime: 30_000, refetchInterval: 60_000 });
}

/**
 * Same key and endpoint as the edit form's `useEvent`, so the two share one
 * cache entry and one request; the parsing happens in `select`, which is
 * per-observer rather than stored.
 */
export function useEventDetail(eventId: number) {
  return useQuery({
    queryKey: qk.events.detail(eventId),
    queryFn: () => fetchEventDetail(eventId),
    // The club's own designer has no event; it passes 0 and asks for nothing.
    enabled: eventId > 0,
    select: (raw: unknown) => eventDetailSchema.parse(raw),
  });
}
