import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";
import { PageHeader } from "@moa/app-kit";

import { TeamworkGate, TeamworkReportsPage } from "@/features/teamwork";

export const metadata: Metadata = { title: "Team reports" };

export default function TeamworkReportsRoute() {
  return (
    <>
      <PageHeader title="Team reports" description="Reply and resolution times, the load per person and topic, the pipeline by stage and type, won and lost." />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <TeamworkGate>
          <TeamworkReportsPage />
        </TeamworkGate>
      </Suspense>
    </>
  );
}
