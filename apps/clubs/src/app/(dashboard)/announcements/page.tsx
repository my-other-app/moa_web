import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { AnnouncementsPage } from "@/features/announcements";

export const metadata: Metadata = { title: "Announcements" };

export default function ClubAnnouncementsPage() {
  // The screen brings its own header, as every rebuilt screen does.
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <AnnouncementsPage />
    </Suspense>
  );
}
