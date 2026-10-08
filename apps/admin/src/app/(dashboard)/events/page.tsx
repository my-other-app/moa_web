import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { EventsV2 } from "@/features/events";

export const metadata: Metadata = { title: "Events" };

export default function EventsPage() {
  return (
    // The v2 screen brings its own header. useSearchParams inside it needs a
    // Suspense boundary.
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <EventsV2 />
    </Suspense>
  );
}
