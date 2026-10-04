import type { Metadata } from "next";

import { BadgeDetail } from "@/features/badges";

export const metadata: Metadata = { title: "Badge" };

export default async function BadgePage({
  params,
}: {
  params: Promise<{ badgeId: string }>;
}) {
  const { badgeId } = await params;
  return <BadgeDetail badgeId={Number(badgeId)} />;
}
