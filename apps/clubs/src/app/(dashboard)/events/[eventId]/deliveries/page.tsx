import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { DeliveryLog } from "@/features/deliveries";

export const metadata: Metadata = { title: "Delivery log" };

export default async function DeliveriesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <DeliveryLog eventId={Number(eventId)} />
    </Suspense>
  );
}
