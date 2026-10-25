"use client";

import { useQuery } from "@tanstack/react-query";
import { nullIfRouteMissing } from "@moa/api";

import { fetchOpsMe } from "./api";
import { hasFeature, type OpsFeature } from "./schemas";

export const OPS_ME_KEY = ["admin", "ops", "me"] as const;

/**
 * What the backend's operator tools offer, or null on a backend without them.
 * Any other failure (a 5xx, the network) also leaves the tools hidden: the
 * query's error, not a crash.
 */
export function useOpsMe() {
  return useQuery({
    queryKey: OPS_ME_KEY,
    queryFn: () => nullIfRouteMissing(fetchOpsMe),
    staleTime: 60_000,
    retry: false,
  });
}

/** Whether the backend has this feature; false while loading, on an old backend, or on an error. */
export function useOpsFeature(feature: OpsFeature): boolean {
  const { data } = useOpsMe();
  return hasFeature(data, feature);
}
