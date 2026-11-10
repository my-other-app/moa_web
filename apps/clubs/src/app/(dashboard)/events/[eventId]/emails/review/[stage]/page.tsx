import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { EventReviewEditor } from "@/features/emails";

export const metadata: Metadata = { title: "Edit review email" };

export default async function EventReviewEmailEditorPage({ params }: { params: Promise<{ eventId: string; stage: string }> }) {
  const { eventId, stage } = await params;

  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <EventReviewEditor eventId={Number(eventId)} stage={stage} />
    </Suspense>
  );
}
