"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchClubAlerts, markClubAlertsRead } from "./api";

export const CLUB_ALERTS_KEY = ["club-alerts"] as const;

/** Asked for every two minutes: a quota warning lands while a send goes out. */
export function useClubAlerts() {
  return useQuery({ queryKey: CLUB_ALERTS_KEY, queryFn: fetchClubAlerts, refetchInterval: 120_000, staleTime: 60_000, retry: false });
}

export function useMarkClubAlertsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: number[]) => markClubAlertsRead(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLUB_ALERTS_KEY }),
  });
}
