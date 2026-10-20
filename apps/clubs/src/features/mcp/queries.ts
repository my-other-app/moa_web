"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { decidePendingAction, disconnectApp, fetchConnectedApps, fetchPendingAction } from "./api";
import { needsReload } from "./schemas";

const KEY = ["mcp"] as const;
const actionKey = (token: string) => [...KEY, "action", token] as const;
const APPS_KEY = [...KEY, "apps"] as const;

/** What an assistant asked for. Not retried: a 404, 410 or 503 is an answer, not a blip. */
export function usePendingAction(token: string) {
  return useQuery({ queryKey: actionKey(token), queryFn: () => fetchPendingAction(token), retry: false, staleTime: 5_000 });
}

/**
 * Approve or turn down. Either answers with the action as it now stands,
 * which replaces the page's copy. Decided elsewhere meanwhile, expired, or
 * its event or draft changed: the page reads it again to show what happened.
 */
export function useDecide(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (decision: "confirm" | "reject") => decidePendingAction(token, decision),
    onSuccess: (next) => {
      queryClient.setQueryData(actionKey(token), next);
      // Its app's waiting count moved.
      void queryClient.invalidateQueries({ queryKey: APPS_KEY });
    },
    onError: (error) => {
      if (needsReload(error)) void queryClient.invalidateQueries({ queryKey: actionKey(token) });
    },
  });
}

export function useConnectedApps() {
  return useQuery({ queryKey: APPS_KEY, queryFn: fetchConnectedApps, retry: false, staleTime: 15_000 });
}

export function useDisconnectApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => disconnectApp(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: APPS_KEY }),
  });
}
