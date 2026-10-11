"use client";

import { Skeleton } from "@moa/ui";

import { useMyClub } from "@/features/club";
import { FollowersPanel } from "./followers-panel";

/**
 * Resolves the club before asking for its followers: the followers endpoint
 * is addressed by club id, which the club login only knows via /clubs/info.
 * The club's own follower count rides along, since the list endpoint does
 * not always carry a total.
 */
export function ClubFollowers() {
  const { data: club, isPending } = useMyClub();
  if (isPending) return <Skeleton className="h-96 w-full rounded-2xl" />;
  return <FollowersPanel clubId={club?.id} total={club?.followers_count ?? null} />;
}
