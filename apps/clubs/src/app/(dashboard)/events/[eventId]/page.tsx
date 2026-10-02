import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { EventWorkspace } from "@/features/registrations";

export const metadata: Metadata = { title: "Event" };

export default async function EventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <EventWorkspace eventId={Number(eventId)} />
    </Suspense>
  );
}
