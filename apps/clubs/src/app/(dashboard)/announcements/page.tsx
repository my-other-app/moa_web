import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { AnnouncementHistory } from "@/features/announcements";

export const metadata: Metadata = { title: "Announcements" };

export default function AnnouncementsPage() {
  return (
    <>
      <header className="mb-5">
        <h1 className="page-title">Announcements</h1>
        <p className="text-ink-2 mt-1 max-w-[62ch] text-[13.5px]">Push notifications sent to the people registered for your events. Send one from an event&apos;s overview.</p>
      </header>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <AnnouncementHistory />
      </Suspense>
    </>
  );
}
