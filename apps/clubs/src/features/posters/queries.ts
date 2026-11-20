"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nullIfRouteMissing, qk } from "@moa/api";

import { fetchPosterSettings, fetchPosterStats, savePosterSettings } from "./api";
import type { PosterSettingsPatch } from "./schemas";

export const posterSettingsKey = (eventId: number) => [...qk.events.detail(eventId), "posters", "settings"] as const;
export const posterStatsKey = (eventId: number) => [...qk.events.detail(eventId), "posters", "stats"] as const;

/**
 * The event's poster settings. An API without posters answers null, and
 * the Posters tab stays away (event-console asks).
 */
export function usePosterSettings(eventId: number) {
  return useQuery({
    queryKey: posterSettingsKey(eventId),
    queryFn: () => nullIfRouteMissing(() => fetchPosterSettings(eventId)),
    enabled: eventId > 0,
    staleTime: 30_000,
    retry: false,
  });
}

/** Save part of the settings: the answer goes straight into the cache. */
export function useSavePosterSettings(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: PosterSettingsPatch) => savePosterSettings(eventId, patch),
    onSuccess: (data) => {
      queryClient.setQueryData(posterSettingsKey(eventId), data);
      void queryClient.invalidateQueries({ queryKey: posterStatsKey(eventId) });
    },
  });
}

/** A minute: posters are made and shared over days, and these are counts. */
export const POSTER_STATS_MS = 60_000;

/** The numbers, read again every minute while the tab is visible. */
export function usePosterStats(eventId: number, enabled = true) {
  return useQuery({
    queryKey: posterStatsKey(eventId),
    queryFn: () => nullIfRouteMissing(() => fetchPosterStats(eventId)),
    enabled: enabled && eventId > 0,
    staleTime: POSTER_STATS_MS / 2,
    refetchInterval: POSTER_STATS_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });
}
