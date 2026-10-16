import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { ClubEventsList } from "@/features/events";

export const metadata: Metadata = { title: "Events" };

export default function EventsPage() {
  // The screen brings its own header, as every rebuilt screen does.
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ClubEventsList />
    </Suspense>
  );
}
