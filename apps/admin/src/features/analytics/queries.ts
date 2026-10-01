"use client";

import { useQuery } from "@tanstack/react-query";
import { qk } from "@moa/api";

import { staleTimes } from "@/lib/query-client";
import { fetchAdminAnalytics } from "./api";

export function useAdminAnalytics() {
  return useQuery({
    queryKey: qk.analytics.dashboard(),
    queryFn: fetchAdminAnalytics,
    staleTime: staleTimes.analytics,
  });
}
