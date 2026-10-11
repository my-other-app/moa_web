import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { RegistrationsPanel } from "@/features/registrations";

export const metadata: Metadata = { title: "Attendees" };

export default async function EventAttendeesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <RegistrationsPanel eventId={Number(eventId)} />
    </Suspense>
  );
}
