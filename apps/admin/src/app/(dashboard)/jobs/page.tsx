import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";
import { PageHeader } from "@moa/app-kit";

import { JobsPage } from "@/features/jobs";

export const metadata: Metadata = { title: "Jobs" };

/**
 * Not behind OpsGate: the queue itself is a route production has had for a
 * while (the "job_dead" alert links here); the failed-and-stuck list inside
 * appears once the backend has it.
 */
export default function JobsRoute() {
  return (
    <>
      <PageHeader title="Jobs" description="The background work behind mails, pushes, renders and sweeps: what waits, what runs, and what failed." />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <JobsPage />
      </Suspense>
    </>
  );
}
