import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";
import { PageHeader } from "@moa/app-kit";

import { DisputesPage } from "@/features/disputes";
import { OpsGate } from "@/features/ops";

export const metadata: Metadata = { title: "Disputes" };

export default function DisputesRoute() {
  return (
    <>
      <PageHeader
        title="Disputes"
        description="Chargebacks Razorpay opened on payments to MyOtherApp's account: what is open, when the evidence is due, and the team's notes."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <OpsGate feature="disputes">
          <DisputesPage />
        </OpsGate>
      </Suspense>
    </>
  );
}
