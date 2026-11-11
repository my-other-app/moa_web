import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { LeadPage } from "@/features/leads";
import { TeamworkGate } from "@/features/teamwork";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadRoute({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  const id = Number(leadId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <TeamworkGate>
        <LeadPage leadId={id} />
      </TeamworkGate>
    </Suspense>
  );
}
