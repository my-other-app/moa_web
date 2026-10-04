import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { PageHeader } from "@moa/app-kit";
import { BadgesTable, NewBadgeButton } from "@/features/badges";

export const metadata: Metadata = { title: "Badges" };

export default function BadgesPage() {
  return (
    <>
      <PageHeader
        title="Badges"
        description="Achievements users and clubs can earn."
        action={<NewBadgeButton />}
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <BadgesTable />
      </Suspense>
    </>
  );
}
