import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { PageHeader } from "@moa/app-kit";
import { TopicsManager } from "@/features/interests";

export const metadata: Metadata = { title: "Topics" };

export default function TopicsPage() {
  return (
    <>
      <PageHeader
        title="Topics"
        description="The main categories, in the order people see them, and the interests under each. Clubs, events and people pick interests; topics are how they are browsed. Renaming either updates it everywhere."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <TopicsManager />
      </Suspense>
    </>
  );
}
