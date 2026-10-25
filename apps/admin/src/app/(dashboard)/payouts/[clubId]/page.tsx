import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { OpsGate } from "@/features/ops";
import { ClubStatement } from "@/features/payouts";

export const metadata: Metadata = { title: "Club statement" };

export default async function ClubStatementPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const id = Number(clubId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <OpsGate feature="payouts">
        <ClubStatement clubId={id} />
      </OpsGate>
    </Suspense>
  );
}
