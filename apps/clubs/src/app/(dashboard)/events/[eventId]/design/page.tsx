import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { DesignerPage } from "@/features/designer";

export const metadata: Metadata = { title: "Ticket & certificate design" };

export default async function EventDesignPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  return (
    <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
      <DesignerPage eventId={Number(eventId)} />
    </Suspense>
  );
}
