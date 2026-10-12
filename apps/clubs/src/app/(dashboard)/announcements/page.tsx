import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { AnnouncementHistory, NewAnnouncementDialog } from "@/features/announcements";

export const metadata: Metadata = { title: "Announcements" };

export default function AnnouncementsPage() {
  return (
    <>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Announcements</h1>
          <p className="text-ink-2 mt-1 max-w-[62ch] text-[13.5px]">Push notifications to the phones of people registered for an event. They arrive in the app, so only guests who signed in there receive one.</p>
        </div>
        <NewAnnouncementDialog />
      </header>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <AnnouncementHistory />
      </Suspense>
    </>
  );
}
