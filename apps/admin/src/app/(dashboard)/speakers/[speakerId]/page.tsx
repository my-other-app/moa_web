import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { SpeakerPage, SpeakersGate } from "@/features/speakers";

export const metadata: Metadata = { title: "Speaker" };

export default async function SpeakerRoute({ params }: { params: Promise<{ speakerId: string }> }) {
  const { speakerId } = await params;
  const id = Number(speakerId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <SpeakersGate>
        <SpeakerPage speakerId={id} />
      </SpeakersGate>
    </Suspense>
  );
}
