import type { Metadata } from "next";

import { PageHeader } from "@moa/app-kit";
import { ClubOverview } from "@/features/club";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <>
      <PageHeader title="Overview" description="Your club at a glance." />
      <ClubOverview />
    </>
  );
}
