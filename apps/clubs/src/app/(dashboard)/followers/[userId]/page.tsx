import type { Metadata } from "next";

import { FollowerProfileView } from "@/features/followers";

export const metadata: Metadata = { title: "Follower" };

export default async function FollowerPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <FollowerProfileView userId={Number(userId)} />;
}
