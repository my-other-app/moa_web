"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { qk } from "@moa/api";

import { fetchEvents, type EventListQuery } from "./api";

export function useEvents(query: EventListQuery) {
  return useQuery({
    queryKey: qk.events.list(query),
    queryFn: () => fetchEvents(query),
    placeholderData: keepPreviousData,
  });
}
