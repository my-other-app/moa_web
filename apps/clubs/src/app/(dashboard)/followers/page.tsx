import type { Metadata } from "next";

import { ClubFollowers } from "@/features/followers";

export const metadata: Metadata = { title: "Followers" };

export default function FollowersPage() {
  // The screen brings its own header, as every rebuilt screen does.
  return <ClubFollowers />;
}
