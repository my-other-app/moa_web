import type { Metadata } from "next";

import { ClubFollowers } from "@/features/followers";

export const metadata: Metadata = { title: "Followers" };

export default function FollowersPage() {
  return (
    <>
      <header className="mb-5">
        <h1 className="page-title">Followers</h1>
        <p className="text-ink-2 mt-1 max-w-[62ch] text-[13.5px]">The people who are told when you publish an event, and when they arrived.</p>
      </header>
      <ClubFollowers />
    </>
  );
}
