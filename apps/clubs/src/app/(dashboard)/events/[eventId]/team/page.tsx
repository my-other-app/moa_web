import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { TeamPage } from "@/features/doors";
import { OrganisersPanel } from "@/features/organisers";

export const metadata: Metadata = { title: "Team & doors" };

export default async function EventTeamPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const id = Number(eventId);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <div className="grid gap-5">
        <TeamPage eventId={id} />
        {/* Its own loading and error: the door failing to load should not hide who is on the event page. */}
        <OrganisersPanel eventId={id} />
      </div>
    </Suspense>
  );
}
