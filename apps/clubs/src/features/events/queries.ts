"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { qk } from "@moa/api";

import { fetchClubEvents, type ClubEventQuery } from "./api";

export function useClubEvents(query: ClubEventQuery) {
  return useQuery({
    queryKey: qk.events.list(query),
    queryFn: () => fetchClubEvents(query),
    placeholderData: keepPreviousData,
  });
}
