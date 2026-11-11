import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";
import { PageHeader } from "@moa/app-kit";

import { DuplicatesPage, SpeakersGate } from "@/features/speakers";

export const metadata: Metadata = { title: "Speakers merge queue" };

export default function SpeakerDuplicatesRoute() {
  return (
    <>
      <PageHeader title="Merge queue" description="Profiles that may be one person, side by side. Merge keeps one with both sets of talks; unmerge takes it back." />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <SpeakersGate>
          <DuplicatesPage />
        </SpeakersGate>
      </Suspense>
    </>
  );
}
