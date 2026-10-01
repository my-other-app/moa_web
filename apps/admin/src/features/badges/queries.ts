"use client";

import { useQuery } from "@tanstack/react-query";
import { qk } from "@moa/api";

import { staleTimes } from "@/lib/query-client";
import { fetchBadges } from "./api";

export function useBadges() {
  return useQuery({
    queryKey: qk.badges.list({}),
    queryFn: fetchBadges,
    staleTime: staleTimes.reference,
  });
}
