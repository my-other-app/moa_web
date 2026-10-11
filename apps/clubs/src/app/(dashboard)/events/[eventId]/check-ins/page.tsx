import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { CheckInsPage } from "@/features/doors";

export const metadata: Metadata = { title: "Check-ins" };

export default async function EventCheckInsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <CheckInsPage eventId={Number(eventId)} />
    </Suspense>
  );
}
