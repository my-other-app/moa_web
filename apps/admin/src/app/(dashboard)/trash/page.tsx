import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { PageHeader } from "@moa/app-kit";
import { TrashTabs } from "@/features/trash";

export const metadata: Metadata = { title: "Trash" };

export default function TrashPage() {
  return (
    <>
      <PageHeader
        title="Trash"
        description="Deleted clubs, events and organisations. Restoring brings a record back exactly as it was — a pending club comes back pending."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <TrashTabs />
      </Suspense>
    </>
  );
}
