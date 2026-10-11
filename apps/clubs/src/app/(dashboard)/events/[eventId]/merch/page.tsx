import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { MerchPage } from "@/features/merch";

export const metadata: Metadata = { title: "Merchandise" };

export default async function EventMerchPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <MerchPage eventId={Number(eventId)} />
    </Suspense>
  );
}
