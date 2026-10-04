import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { PageHeader } from "@moa/app-kit";
import { NotificationLog } from "@/features/audit";

export const metadata: Metadata = { title: "Announcements" };

export default function AnnouncementsPage() {
  return (
    <>
      <PageHeader
        title="Announcements"
        description="Everything clubs have pushed to their followers' phones. These cannot be recalled."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <NotificationLog />
      </Suspense>
    </>
  );
}
