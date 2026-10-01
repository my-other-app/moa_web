import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { PageHeader } from "@/components/page-header";
import { BadgesTable } from "@/features/badges";

export const metadata: Metadata = { title: "Badges" };

export default function BadgesPage() {
  return (
    <>
      <PageHeader
        title="Badges"
        description="Achievements users and clubs can earn."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <BadgesTable />
      </Suspense>
    </>
  );
}
