import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { QuestsPage } from "@/features/quests";

export const metadata: Metadata = { title: "Quests" };

export default async function EventQuestsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <QuestsPage eventId={Number(eventId)} />
    </Suspense>
  );
}
