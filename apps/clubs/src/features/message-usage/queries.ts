"use client";

import { useQuery } from "@tanstack/react-query";
import { nullIfRouteMissing } from "@moa/api";

import { fetchMessageHistory, fetchMessageUsage } from "./api";

export const MESSAGE_USAGE_KEY = ["message-usage"] as const;

/**
 * A minute fresh: a broadcast going out moves it while the page is open.
 * `null`: a backend from before message quotas (the route answers a bare
 * 404) -- nothing to show yet, and nothing broken.
 */
export function useMessageUsage() {
  return useQuery({
    queryKey: [...MESSAGE_USAGE_KEY, "month"],
    queryFn: () => nullIfRouteMissing(fetchMessageUsage),
    staleTime: 60_000,
    retry: false,
  });
}

export function useMessageHistory(enabled = true) {
  return useQuery({
    queryKey: [...MESSAGE_USAGE_KEY, "history"],
    queryFn: () => nullIfRouteMissing(fetchMessageHistory),
    staleTime: 5 * 60_000,
    retry: false,
    enabled,
  });
}
