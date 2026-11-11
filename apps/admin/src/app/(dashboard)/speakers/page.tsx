import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";
import { PageHeader } from "@moa/app-kit";

import { SpeakersGate, SpeakersPage } from "@/features/speakers";

export const metadata: Metadata = { title: "Speakers" };

export default function SpeakersRoute() {
  return (
    <>
      <PageHeader title="Speakers" description="Everyone who has spoken at a MyOtherApp event, one profile per person, with their talks, clubs and topics." />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <SpeakersGate>
          <SpeakersPage />
        </SpeakersGate>
      </Suspense>
    </>
  );
}
