import type { Metadata } from "next";

import { PageHeader } from "@moa/app-kit";
import { ClubFollowers } from "@/features/followers";

export const metadata: Metadata = { title: "Followers" };

export default function FollowersPage() {
  return (
    <>
      <PageHeader
        title="Followers"
        description="People who are notified when you publish an event."
      />
      <div className="max-w-3xl">
        <ClubFollowers />
      </div>
    </>
  );
}
