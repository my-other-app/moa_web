import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { GamesPage } from "@/features/games";

export const metadata: Metadata = { title: "Games" };

export default async function EventGamesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <GamesPage eventId={Number(eventId)} />
    </Suspense>
  );
}
