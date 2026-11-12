"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";

import type { LayoutV2 } from "@moa/layout";

import {
  type ArtworkField,
  fetchArtwork,
  fetchBoard,
  fetchLayout,
  fetchStarterLayout,
  resetDesign,
  resetPreset,
  saveArtwork,
  saveBoard,
  saveLayout,
  savePreset,
  type LayoutBody,
} from "./api";
import type { Audience, BoardDesign, BoardKind, DesignKind, DesignScope, LayerDesign, PresetChoice } from "./schemas";

const CLUB = ["club-designs"] as const;
const scopeKey = (scope: DesignScope) => (scope.kind === "event" ? qk.eventDesigns.forEvent(scope.eventId) : CLUB);
const layoutKey = (scope: DesignScope, kind: DesignKind, audience: Audience) =>
  scope.kind === "event" ? ([...qk.eventDesigns.detail(scope.eventId, kind, audience), "layout"] as const) : ([...CLUB, kind, audience, "layout"] as const);

export function useLayout(scope: DesignScope, kind: DesignKind, audience: Audience) {
  return useQuery({
    queryKey: layoutKey(scope, kind, audience),
    queryFn: () => fetchLayout(scope, kind, audience),
    /*
     * No staleTime. A design is edited and saved in the same sitting, and a
     * cached copy served after a save would show the organiser the version
     * they just replaced.
     */
    staleTime: 0,
  });
}

/**
 * What a save answers -- the saved design -- written straight into the cache
 * rather than invalidated, because a refetch would briefly show the old one.
 * The sibling audiences are invalidated instead: the first save forks the
 * event's design, which changes what they fall back to.
 */
function useWriteSaved(scope: DesignScope, kind: DesignKind, audience: Audience) {
  const queryClient = useQueryClient();
  return (data: LayerDesign) => {
    queryClient.setQueryData(layoutKey(scope, kind, audience), data);
    void queryClient.invalidateQueries({
      queryKey: scopeKey(scope),
      predicate: (query) => query.queryKey.at(-1) === "layout" && query.queryKey.at(-2) !== audience,
    });
  };
}

export function useSaveLayout(scope: DesignScope, kind: DesignKind, audience: Audience) {
  const written = useWriteSaved(scope, kind, audience);
  return useMutation({ mutationFn: (body: LayoutBody) => saveLayout(scope, kind, audience, body), onSuccess: written });
}

/** Save a ready design and its settings for this audience. */
export function useSavePreset(scope: DesignScope, kind: DesignKind, audience: Audience) {
  const written = useWriteSaved(scope, kind, audience);
  return useMutation({ mutationFn: (choice: PresetChoice) => savePreset(scope, kind, audience, choice), onSuccess: written });
}

/** Drop the ready design saved here, so the design follows what it came from. */
export function useResetPreset(scope: DesignScope, kind: DesignKind, audience: Audience) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => resetPreset(scope, kind, audience),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scopeKey(scope) }),
  });
}

export function useResetLayout(scope: DesignScope, kind: DesignKind, audience: Audience) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => resetDesign(scope, kind, audience),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scopeKey(scope) }),
  });
}

const artworkKey = (eventId: number, kind: DesignKind, audience: Audience) => [...qk.eventDesigns.detail(eventId, kind, audience), "artwork"] as const;

/** An event's certificate pictures; nothing for the club's templates, which have no such upload. */
export function useArtwork(scope: DesignScope, kind: DesignKind, audience: Audience, enabled: boolean) {
  const eventId = scope.kind === "event" ? scope.eventId : 0;
  return useQuery({
    queryKey: artworkKey(eventId, kind, audience),
    queryFn: () => fetchArtwork(eventId, kind, audience),
    enabled: enabled && eventId > 0,
    staleTime: 0,
  });
}

/**
 * Upload or remove one picture. It forks the event's design when the event
 * followed the club's, so the design itself is read again too.
 */
export function useSaveArtwork(scope: DesignScope, kind: DesignKind, audience: Audience) {
  const queryClient = useQueryClient();
  const eventId = scope.kind === "event" ? scope.eventId : 0;
  return useMutation({
    mutationFn: ({ field, file }: { field: ArtworkField; file: File | null }) => saveArtwork(eventId, kind, audience, field, file),
    onSuccess: (artwork) => {
      queryClient.setQueryData(artworkKey(eventId, kind, audience), artwork);
      void queryClient.invalidateQueries({ queryKey: layoutKey(scope, kind, audience) });
    },
  });
}

// ─── Layout v2: the board ───────────────────────────────────────────────

/** The board's design: the same route as the canvas's, read as v2, so it has its own key. */
const boardKey = (scope: DesignScope, kind: BoardKind, audience: Audience) => [...layoutKey(scope, kind, audience), "v2"] as const;

export function useBoard(scope: DesignScope, kind: BoardKind, audience: Audience) {
  return useQuery({ queryKey: boardKey(scope, kind, audience), queryFn: () => fetchBoard(scope, kind, audience), staleTime: 0 });
}

/** A starter's layout, fetched when one is picked; kept a minute so going back and forth does not fetch again. */
export function useStarterLayout(scope: DesignScope, kind: BoardKind, id: string | null) {
  return useQuery({
    queryKey: [...boardKey(scope, kind, "event_default"), "starter", id] as const,
    queryFn: () => fetchStarterLayout(scope, kind, id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}

/** Save the board: the answer goes straight into the cache, and the other audiences are read again (the first save forks). */
export function useSaveBoard(scope: DesignScope, kind: BoardKind, audience: Audience) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (layout: LayoutV2) => saveBoard(scope, kind, audience, layout),
    onSuccess: (data: BoardDesign) => {
      queryClient.setQueryData(boardKey(scope, kind, audience), data);
      void queryClient.invalidateQueries({
        queryKey: scopeKey(scope),
        predicate: (query) => !(query.queryKey.at(-1) === "v2" && query.queryKey.at(-3) === audience),
      });
    },
  });
}
