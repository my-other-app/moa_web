import type { Metadata } from "next";

import { ClubDetail } from "@/features/clubs";

export const metadata: Metadata = { title: "Club" };

export default async function ClubPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  return <ClubDetail clubId={Number(clubId)} />;
}
