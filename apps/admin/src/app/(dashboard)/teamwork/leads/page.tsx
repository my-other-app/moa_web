import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";
import { PageHeader } from "@moa/app-kit";

import { LeadsPage } from "@/features/leads";
import { TeamworkGate } from "@/features/teamwork";

export const metadata: Metadata = { title: "Leads" };

export default function LeadsRoute() {
  return (
    <>
      <PageHeader title="Leads" description="Clubs to bring on, sponsors, venue partners and vendors: every one with a stage, an owner and a next step on a date." />
      {/* The new-lead form reads its prefill from the address, which needs a Suspense boundary. */}
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <TeamworkGate>
          <LeadsPage />
        </TeamworkGate>
      </Suspense>
    </>
  );
}
