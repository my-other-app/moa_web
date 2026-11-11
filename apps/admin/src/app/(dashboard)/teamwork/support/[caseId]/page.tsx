import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { CasePage } from "@/features/support";
import { TeamworkGate } from "@/features/teamwork";

export const metadata: Metadata = { title: "Case" };

export default async function CaseRoute({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const id = Number(caseId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <TeamworkGate>
        <CasePage caseId={id} />
      </TeamworkGate>
    </Suspense>
  );
}
