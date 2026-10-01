import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { PageHeader } from "@/components/page-header";
import { EventsTable } from "@/features/events";

export const metadata: Metadata = { title: "Events" };

export default function EventsPage() {
  return (
    <>
      <PageHeader title="Events" description="Every event across all clubs." />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <EventsTable />
      </Suspense>
    </>
  );
}
