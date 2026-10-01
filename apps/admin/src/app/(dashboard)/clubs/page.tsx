import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { PageHeader } from "@/components/page-header";
import { ClubsTable } from "@/features/clubs";

export const metadata: Metadata = { title: "Clubs" };

export default function ClubsPage() {
  return (
    <>
      <PageHeader
        title="Clubs"
        description="Approve new clubs and manage existing ones."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ClubsTable />
      </Suspense>
    </>
  );
}
