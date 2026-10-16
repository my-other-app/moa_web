"use client";

import { FollowersPage } from "./followers-page";

/** The followers route. The page addresses the club by its session, so nothing waits on /clubs/info. */
export function ClubFollowers() {
  return <FollowersPage />;
}
