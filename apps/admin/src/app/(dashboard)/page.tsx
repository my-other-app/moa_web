import type { Metadata } from "next";

import { PageHeader } from "@moa/app-kit";
import { ModerationQueue, OverviewCards, TrendsPanel } from "@/features/analytics";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        description="Platform activity, and anything waiting on a decision."
      />
      <div className="space-y-6">
        <OverviewCards />
        {/*
         * Trends replace the old seven-day sign-up chart: same idea, but every
         * metric and a comparison against the previous window, so the numbers
         * above have a direction.
         */}
        <TrendsPanel />
        <ModerationQueue />
      </div>
    </>
  );
}
