import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { PageHeader } from "@moa/app-kit";
import { PaymentsTable } from "@/features/payments";

export const metadata: Metadata = { title: "Payments" };

export default function PaymentsPage() {
  return (
    <>
      <PageHeader
        title="Payments"
        description="Every transaction taken through the app. Refunds are full-amount only and are logged."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <PaymentsTable />
      </Suspense>
    </>
  );
}
