import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";
import { PageHeader } from "@moa/app-kit";

import { OpsGate } from "@/features/ops";
import { PayoutsOverview } from "@/features/payouts";

export const metadata: Metadata = { title: "Payouts" };

export default function PayoutsPage() {
  return (
    <>
      <PageHeader
        title="Payouts"
        description="What MyOtherApp owes each club for tickets and store sales taken on its own Razorpay: gross, less Razorpay's fees, refunds and chargebacks, less what was paid out."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <OpsGate feature="payouts">
          <PayoutsOverview />
        </OpsGate>
      </Suspense>
    </>
  );
}
