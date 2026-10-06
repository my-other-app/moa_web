"use client";

import { useQuery } from "@tanstack/react-query";
import { staleTimes } from "@moa/app-kit";

import { fetchClubFollowers } from "./api";

export function useClubFollowers(
  clubId: number | null | undefined,
  query: { offset: number; limit: number }
) {
  return useQuery({
    queryKey: ["club", clubId, "followers", query.offset, query.limit],
    queryFn: () => fetchClubFollowers(clubId as number, query),
    staleTime: staleTimes.analytics,
    // The club id comes from /clubs/info, so this waits rather than firing a
    // request at /clubs/followers/undefined.
    enabled: typeof clubId === "number" && clubId > 0,
  });
}
