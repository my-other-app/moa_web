import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { AgendaPage } from "@/features/agenda";

export const metadata: Metadata = { title: "Agenda" };

export default async function EventAgendaPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <AgendaPage eventId={Number(eventId)} />
    </Suspense>
  );
}
