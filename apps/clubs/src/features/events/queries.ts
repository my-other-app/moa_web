"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { qk } from "@moa/api";

import { fetchClubEvents, fetchEventDetail, type ClubEventQuery } from "./api";
import { eventDetailSchema } from "./schemas";

export function useClubEvents(query: ClubEventQuery) {
  return useQuery({
    queryKey: qk.events.list(query),
    queryFn: () => fetchClubEvents(query),
    placeholderData: keepPreviousData,
  });
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
