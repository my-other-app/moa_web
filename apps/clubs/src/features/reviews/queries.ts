"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { staleTimes } from "@moa/app-kit";

import { fetchEventReviews } from "./api";

export const REVIEW_PAGE_SIZE = 20;

/**
 * Paged with `useInfiniteQuery` rather than offset state because the endpoint
 * reports neither a total nor a next cursor: the only signal that more exist
 * is a full page coming back.
 */
export function useEventReviews(eventId: number) {
  return useInfiniteQuery({
    queryKey: ["club", "event", eventId, "reviews"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchEventReviews(eventId, { offset: pageParam, limit: REVIEW_PAGE_SIZE }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.items.length < REVIEW_PAGE_SIZE
        ? undefined
        : allPages.length * REVIEW_PAGE_SIZE,
    staleTime: staleTimes.analytics,
    enabled: Number.isFinite(eventId) && eventId > 0,
  });
}
