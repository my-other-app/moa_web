"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nullIfRouteMissing, qk } from "@moa/api";

import { gameToastError } from "./lib/errors";

import {
  createHero,
  createPoint,
  deleteHero,
  deletePoint,
  fetchCardConfig,
  fetchCardLive,
  fetchFeed,
  fetchHeroes,
  fetchHunt,
  fetchHuntLive,
  fetchPlayers,
  fetchPoints,
  fetchScreen,
  fetchSettings,
  huntAction,
  orderHeroes,
  resetPin,
  rotateScreen,
  saveCardConfig,
  saveHunt,
  saveSettings,
  setFeedHidden,
  updateHero,
  updatePoint,
  uploadHeroArt,
  setFooterImage,
  uploadLogo,
} from "./api";
import type { CardConfigPatch, HeroInput, HuntAction, HuntPatch, PointInput, SettingsPatch } from "./schemas";

const root = (eventId: number) => [...qk.events.detail(eventId), "games"] as const;
const key = (eventId: number, ...rest: string[]) => [...root(eventId), ...rest] as const;

/** How often the live numbers ask again, while the page is on screen. */
export const LIVE_MS = 5_000;

/**
 * The settings: null from an API without the games, which keeps the Games
 * section out of the event's tabs (the console asks).
 */
export function useGamesSettings(eventId: number) {
  return useQuery({
    queryKey: key(eventId, "settings"),
    queryFn: () => nullIfRouteMissing(() => fetchSettings(eventId)),
    enabled: eventId > 0,
    staleTime: 10_000,
    retry: false,
  });
}

export function useSaveSettings(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => saveSettings(eventId, patch),
    onSuccess: (data) => qc.setQueryData(key(eventId, "settings"), data),
  });
}

export function useUploadLogo(eventId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (file: File) => uploadLogo(eventId, file), onSuccess: (data) => qc.setQueryData(key(eventId, "settings"), data) });
}

export function useFooterImage(eventId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (file: File | null) => setFooterImage(eventId, file), onSuccess: (data) => qc.setQueryData(key(eventId, "settings"), data) });
}

export function useScreenLink(eventId: number, enabled: boolean) {
  return useQuery({ queryKey: key(eventId, "screen"), queryFn: () => fetchScreen(eventId), enabled: enabled && eventId > 0, staleTime: 60_000, retry: false });
}

export function useRotateScreen(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => rotateScreen(eventId),
    onSuccess: (data) => {
      qc.setQueryData(key(eventId, "screen"), data);
      void qc.invalidateQueries({ queryKey: key(eventId, "settings") });
    },
  });
}

// ─── Hero Cards ──────────────────────────────────────────────────────────

export function useCardConfig(eventId: number, enabled = true) {
  return useQuery({ queryKey: key(eventId, "cards", "config"), queryFn: () => fetchCardConfig(eventId), enabled: enabled && eventId > 0, staleTime: 10_000, retry: false });
}

export function useSaveCardConfig(eventId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (patch: CardConfigPatch) => saveCardConfig(eventId, patch), onSuccess: (data) => qc.setQueryData(key(eventId, "cards", "config"), data) });
}

/** The monitor's numbers: every five seconds while the tab is visible. */
export function useCardLive(eventId: number, enabled = true) {
  return useQuery({
    queryKey: key(eventId, "cards", "live"),
    queryFn: () => fetchCardLive(eventId),
    enabled: enabled && eventId > 0,
    staleTime: LIVE_MS / 2,
    refetchInterval: LIVE_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });
}

export function useHeroes(eventId: number, enabled = true) {
  return useQuery({ queryKey: key(eventId, "cards", "heroes"), queryFn: () => fetchHeroes(eventId), enabled: enabled && eventId > 0, staleTime: 10_000, retry: false });
}

function useRefreshHeroes(eventId: number) {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: key(eventId, "cards") });
}

/** Make or change a hero, then put its picture up: one save, in that order. */
export function useSaveHero(eventId: number) {
  const refresh = useRefreshHeroes(eventId);
  return useMutation({
    mutationFn: async ({ heroId, body, art }: { heroId: string | null; body: HeroInput; art: File | null }) => {
      const hero = heroId ? await updateHero(eventId, heroId, body) : await createHero(eventId, body);
      return art ? uploadHeroArt(eventId, hero.id, art) : hero;
    },
    onSuccess: refresh,
  });
}

export function useDeleteHero(eventId: number) {
  const refresh = useRefreshHeroes(eventId);
  return useMutation({ mutationFn: (heroId: string) => deleteHero(eventId, heroId), onSuccess: refresh, onError: gameToastError });
}

export function useOrderHeroes(eventId: number) {
  const refresh = useRefreshHeroes(eventId);
  return useMutation({ mutationFn: (ids: string[]) => orderHeroes(eventId, ids), onSuccess: refresh, onError: gameToastError });
}

// ─── The Scavenger Hunt ──────────────────────────────────────────────────

export function useHunt(eventId: number, enabled = true) {
  return useQuery({ queryKey: key(eventId, "hunt"), queryFn: () => fetchHunt(eventId), enabled: enabled && eventId > 0, staleTime: 5_000, refetchInterval: LIVE_MS * 3, refetchIntervalInBackground: false, retry: false });
}

export function useSaveHunt(eventId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (patch: HuntPatch) => saveHunt(eventId, patch), onSuccess: (data) => qc.setQueryData(key(eventId, "hunt"), data) });
}

export function useHuntAction(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, minutes }: { action: HuntAction; minutes?: number }) => huntAction(eventId, action, minutes),
    onSuccess: (data) => {
      qc.setQueryData(key(eventId, "hunt"), data);
      void qc.invalidateQueries({ queryKey: key(eventId, "hunt", "live") });
    },
    onError: gameToastError,
  });
}

export function usePoints(eventId: number, enabled = true) {
  return useQuery({
    queryKey: key(eventId, "hunt", "points"),
    queryFn: () => fetchPoints(eventId),
    enabled: enabled && eventId > 0,
    staleTime: LIVE_MS / 2,
    refetchInterval: LIVE_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });
}

function useRefreshPoints(eventId: number) {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: key(eventId, "hunt", "points") });
}

export function useCreatePoint(eventId: number) {
  const refresh = useRefreshPoints(eventId);
  return useMutation({ mutationFn: (body: PointInput) => createPoint(eventId, body), onSuccess: refresh });
}

export function useUpdatePoint(eventId: number) {
  const refresh = useRefreshPoints(eventId);
  return useMutation({ mutationFn: ({ pointId, body }: { pointId: string; body: Partial<PointInput> }) => updatePoint(eventId, pointId, body), onSuccess: refresh });
}

export function useDeletePoint(eventId: number) {
  const refresh = useRefreshPoints(eventId);
  return useMutation({ mutationFn: (pointId: string) => deletePoint(eventId, pointId), onSuccess: refresh, onError: gameToastError });
}

export function useHuntLive(eventId: number, enabled = true) {
  return useQuery({
    queryKey: key(eventId, "hunt", "live"),
    queryFn: () => fetchHuntLive(eventId),
    enabled: enabled && eventId > 0,
    staleTime: LIVE_MS / 2,
    refetchInterval: LIVE_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });
}

// ─── Players ─────────────────────────────────────────────────────────────

export function usePlayers(eventId: number, q: { q: string; optedOut: boolean }, enabled = true) {
  return useQuery({
    queryKey: key(eventId, "players", q.q, String(q.optedOut)),
    queryFn: () => fetchPlayers(eventId, q),
    enabled: enabled && eventId > 0,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    retry: false,
  });
}

export function useResetPin(eventId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (registrationId: string) => resetPin(eventId, registrationId), onSuccess: () => void qc.invalidateQueries({ queryKey: key(eventId, "players") }) });
}

// ─── The venue screen's feed ─────────────────────────────────────────────

export function useFeed(eventId: number, enabled = true) {
  return useQuery({ queryKey: key(eventId, "feed"), queryFn: () => fetchFeed(eventId), enabled: enabled && eventId > 0, staleTime: LIVE_MS / 2, refetchInterval: LIVE_MS * 3, refetchIntervalInBackground: false, retry: false });
}

export function useSetFeedHidden(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ feedId, hidden }: { feedId: string; hidden: boolean }) => setFeedHidden(eventId, feedId, hidden),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key(eventId, "feed") }),
  });
}
