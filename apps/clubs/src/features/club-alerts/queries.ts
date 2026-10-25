"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nullIfRouteMissing } from "@moa/api";

import { fetchClubAlerts, markClubAlertsRead } from "./api";

export const CLUB_ALERTS_KEY = ["club-alerts"] as const;

/** Every two minutes: a quota warning lands while a send goes out. */
export const ALERTS_EVERY = 120_000;
/** How often a backend without the bell (see useClubAlerts) is asked again, to show it once it has one. */
export const NO_BELL_EVERY = 15 * 60_000;

/**
 * The bell's notices. `null`: a backend from before them (the route answers
 * a bare 404) -- no bell, asked again only now and then, so the bell turns
 * up by itself once that backend is deployed.
 */
export function useClubAlerts() {
  return useQuery({
    queryKey: CLUB_ALERTS_KEY,
    queryFn: () => nullIfRouteMissing(fetchClubAlerts),
    refetchInterval: (query) => (query.state.data === null ? NO_BELL_EVERY : ALERTS_EVERY),
    staleTime: 60_000,
    retry: false,
  });
}

export function useMarkClubAlertsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: number[]) => markClubAlertsRead(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLUB_ALERTS_KEY }),
  });
}
