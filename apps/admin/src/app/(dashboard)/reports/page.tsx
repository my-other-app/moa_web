import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { ReportsPage } from "@/features/reports";

export const metadata: Metadata = { title: "Reports" };

export default function AdminReportsPage() {
  return (
    // useListParams reads the search params, which need a Suspense boundary.
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ReportsPage />
    </Suspense>
  );
}
