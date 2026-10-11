import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { CloseoutPage } from "@/features/closeout";

export const metadata: Metadata = { title: "Closeout" };

export default async function EventCloseoutPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <CloseoutPage eventId={Number(eventId)} />
    </Suspense>
  );
}
