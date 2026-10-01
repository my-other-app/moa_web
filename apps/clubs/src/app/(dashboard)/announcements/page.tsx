import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@moa/app-kit";
import { Skeleton } from "@moa/ui";

import { AnnouncementHistory } from "@/features/announcements";

export const metadata: Metadata = { title: "Announcements" };

export default function AnnouncementsPage() {
  return (
    <>
      <PageHeader
        title="Announcements"
        description="Push notifications sent to people registered for your events."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <AnnouncementHistory />
      </Suspense>
    </>
  );
}
