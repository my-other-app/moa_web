import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@moa/app-kit";
import { Skeleton } from "@moa/ui";

import { EventDesignWorkspace } from "@/features/event-designs";

export const metadata: Metadata = { title: "Ticket & certificate design" };

export default async function EventDesignPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  return (
    <>
      <PageHeader
        title="Ticket & certificate design"
        description="Starts from your club's default. Saving makes a copy for this event only, so your other events are left alone."
      />
      <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
        <EventDesignWorkspace eventId={Number(eventId)} />
      </Suspense>
    </>
  );
}
