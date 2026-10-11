import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { IdCardsPage } from "@/features/idcards";

export const metadata: Metadata = { title: "ID cards" };

export default async function EventIdCardsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <IdCardsPage eventId={Number(eventId)} />
    </Suspense>
  );
}
