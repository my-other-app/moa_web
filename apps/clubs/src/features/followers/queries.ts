"use client";

import { useQuery } from "@tanstack/react-query";
import { staleTimes } from "@moa/app-kit";

import { keepPreviousData } from "@tanstack/react-query";

import { fetchClubFollowers, fetchFollowerProfile, fetchFollowersInsights, fetchFollowersList, type FollowersQuery } from "./api";

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

export function useFollowerProfile(clubId: number | null | undefined, userId: number) {
  return useQuery({
    queryKey: ["followers", "profile", clubId ?? 0, userId],
    queryFn: () => fetchFollowerProfile(clubId as number, userId),
    enabled: !!clubId && userId > 0,
  });
}

export function useFollowersList(q: FollowersQuery) {
  return useQuery({ queryKey: ["followers", "list", q], queryFn: () => fetchFollowersList(q), staleTime: 30_000, placeholderData: keepPreviousData });
}

export function useFollowersInsights() {
  return useQuery({ queryKey: ["followers", "insights"], queryFn: fetchFollowersInsights, staleTime: 60_000 });
}
