import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";
import { PageHeader } from "@moa/app-kit";

import { TeamworkGate, TeamworkSettingsPage } from "@/features/teamwork";

export const metadata: Metadata = { title: "Team settings" };

export default function TeamworkSettingsRoute() {
  return (
    <>
      <PageHeader title="Team settings" description="Who is in Support and Sales, the topics and who answers them, saved replies, help answers, lost reasons and the desk's hours." />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <TeamworkGate>
          <TeamworkSettingsPage />
        </TeamworkGate>
      </Suspense>
    </>
  );
}
