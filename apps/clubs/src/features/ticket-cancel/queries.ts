"use client";

import { useQuery } from "@tanstack/react-query";
import { qk } from "@moa/api";

import { fetchGivenBack } from "./api";

/**
 * Who gave their ticket back, under the event's registrations key: whatever
 * refreshes the list (a removal, an import) reads this again too.
 */
export function useGivenBack(eventId: number) {
  return useQuery({
    queryKey: [...qk.events.registrations(eventId), "given-back"],
    queryFn: () => fetchGivenBack(eventId),
    enabled: eventId > 0,
    staleTime: 30_000,
    retry: false,
  });
}
