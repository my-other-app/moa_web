"use client";

import { useMyClub } from "@/features/club";
import { Skeleton } from "@moa/ui";

import { FollowersPanel } from "./followers-panel";

/**
 * Resolves the club before asking for its followers.
 *
 * The followers endpoint is addressed by club id and the club login only
 * knows its own id via /clubs/info, so the page would otherwise have to
 * either fetch it twice or request /clubs/followers/undefined.
 */
export function ClubFollowers() {
  const { data: club, isPending } = useMyClub();

  if (isPending) return <Skeleton className="h-96 w-full rounded-xl" />;

  return <FollowersPanel clubId={club?.id} />;
}
