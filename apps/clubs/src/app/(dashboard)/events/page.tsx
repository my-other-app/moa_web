import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@moa/app-kit";
import { Skeleton } from "@moa/ui";

import { ClubEventsList } from "@/features/events";

export const metadata: Metadata = { title: "Events" };

export default function EventsPage() {
  return (
    <>
      {/* The design puts the filters, search and CTA directly under the title
          rather than in a header action slot, so the list owns them. */}
      <PageHeader title="Events" />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ClubEventsList />
      </Suspense>
    </>
  );
}
