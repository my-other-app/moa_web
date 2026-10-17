import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { PageHeader } from "@moa/app-kit";
import { GatewaysList } from "@/features/payment-gateways";

export const metadata: Metadata = { title: "Club gateways" };

export default function PaymentGatewaysPage() {
  return (
    <>
      <PageHeader
        title="Club gateways"
        description="Clubs that take ticket payments in their own Razorpay account. Disabling one sends its new payments to MyOtherApp's account."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <GatewaysList />
      </Suspense>
    </>
  );
}
