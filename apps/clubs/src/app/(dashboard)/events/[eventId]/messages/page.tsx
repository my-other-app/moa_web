import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { MessagesPage } from "@/features/emails";

export const metadata: Metadata = { title: "Messages" };

export default async function EventMessagesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <MessagesPage eventId={Number(eventId)} />
    </Suspense>
  );
}
