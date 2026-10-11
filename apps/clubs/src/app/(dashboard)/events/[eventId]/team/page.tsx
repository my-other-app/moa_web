import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { TeamPage } from "@/features/doors";

export const metadata: Metadata = { title: "Team & doors" };

export default async function EventTeamPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <TeamPage eventId={Number(eventId)} />
    </Suspense>
  );
}
