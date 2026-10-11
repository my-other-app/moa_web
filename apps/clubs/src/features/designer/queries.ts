"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";

import { fetchLayout, resetDesign, saveLayout, type LayoutBody } from "./api";
import type { Audience, DesignKind, DesignScope } from "./schemas";

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

export function useSaveLayout(scope: DesignScope, kind: DesignKind, audience: Audience) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LayoutBody) => saveLayout(scope, kind, audience, body),
    onSuccess: (data) => {
      /*
       * Written straight into the cache rather than invalidated, because the
       * response is the saved design and a refetch would briefly show the
       * old one. The sibling audiences are invalidated instead: the first
       * save forks the event's design, which changes what they fall back to.
       */
      queryClient.setQueryData(layoutKey(scope, kind, audience), data);
      void queryClient.invalidateQueries({
        queryKey: scopeKey(scope),
        predicate: (query) => query.queryKey.at(-1) === "layout" && query.queryKey.at(-2) !== audience,
      });
    },
  });
}

export function useResetLayout(scope: DesignScope, kind: DesignKind, audience: Audience) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => resetDesign(scope, kind, audience),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scopeKey(scope) }),
  });
}
