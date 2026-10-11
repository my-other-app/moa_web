"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";

import { fetchLayout, resetDesign, saveLayout, type LayoutBody } from "./api";
import type { Audience, DesignKind } from "./schemas";

const layoutKey = (eventId: number, kind: DesignKind, audience: Audience) =>
  [...qk.eventDesigns.detail(eventId, kind, audience), "layout"] as const;

export function useLayout(eventId: number, kind: DesignKind, audience: Audience) {
  return useQuery({
    queryKey: layoutKey(eventId, kind, audience),
    queryFn: () => fetchLayout(eventId, kind, audience),
    /*
     * No staleTime. A design is edited and saved in the same sitting, and a
     * cached copy served after a save would show the organiser the version
     * they just replaced.
     */
    staleTime: 0,
  });
}

export function useSaveLayout(eventId: number, kind: DesignKind, audience: Audience) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LayoutBody) => saveLayout(eventId, kind, audience, body),
    onSuccess: (data) => {
      /*
       * Written straight into the cache rather than invalidated, because the
       * response is the saved design and a refetch would briefly show the
       * old one. The sibling audiences are invalidated instead: the first
       * save forks the event's design, which changes what they fall back to.
       */
      queryClient.setQueryData(layoutKey(eventId, kind, audience), data);
      void queryClient.invalidateQueries({
        queryKey: qk.eventDesigns.forEvent(eventId),
        predicate: (query) => query.queryKey.at(-1) === "layout" && query.queryKey[3] !== audience,
      });
    },
  });
}

export function useResetLayout(eventId: number, kind: DesignKind, audience: Audience) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => resetDesign(eventId, kind, audience),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.eventDesigns.forEvent(eventId) }),
  });
}
