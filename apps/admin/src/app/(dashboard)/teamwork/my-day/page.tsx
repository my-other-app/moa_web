import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";
import { PageHeader } from "@moa/app-kit";

import { MyDayPage, TeamworkGate } from "@/features/teamwork";

export const metadata: Metadata = { title: "My day" };

export default function MyDayRoute() {
  return (
    <>
      <PageHeader title="My day" description="Your follow-ups due today and overdue, and the cases waiting on you." />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <TeamworkGate>
          <MyDayPage />
        </TeamworkGate>
      </Suspense>
    </>
  );
}
