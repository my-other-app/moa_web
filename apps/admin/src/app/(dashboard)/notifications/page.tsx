import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { NotificationsPage } from "@/features/notifications";

export const metadata: Metadata = { title: "Notifications" };

export default function AdminNotificationsPage() {
  return (
    // useListParams reads the search params, which need a Suspense boundary.
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <NotificationsPage />
    </Suspense>
  );
}
