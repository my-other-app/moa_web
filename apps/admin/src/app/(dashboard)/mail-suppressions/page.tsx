import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";
import { PageHeader } from "@moa/app-kit";

import { OpsGate } from "@/features/ops";
import { SuppressionsPage } from "@/features/suppressions";

export const metadata: Metadata = { title: "Mail suppressions" };

export default function SuppressionsRoute() {
  return (
    <>
      <PageHeader title="Mail suppressions" description="Addresses the platform no longer mails because they bounced or marked our mail as spam, and why." />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <OpsGate feature="suppressions">
          <SuppressionsPage />
        </OpsGate>
      </Suspense>
    </>
  );
}
