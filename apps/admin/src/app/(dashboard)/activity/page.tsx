import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { PageHeader } from "@moa/app-kit";
import { AuditLogTable } from "@/features/audit";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <>
      <PageHeader
        title="Activity"
        description="Every admin action, newest first. Append-only — nothing here can be edited or removed."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <AuditLogTable />
      </Suspense>
    </>
  );
}
