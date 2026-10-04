import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { PageHeader } from "@moa/app-kit";
import { TrashTable } from "@/features/clubs";

export const metadata: Metadata = { title: "Trash" };

export default function TrashPage() {
  return (
    <>
      <PageHeader
        title="Trash"
        description="Deleted and rejected clubs. Restoring brings a club back exactly as it was — a pending club comes back pending."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <TrashTable />
      </Suspense>
    </>
  );
}
