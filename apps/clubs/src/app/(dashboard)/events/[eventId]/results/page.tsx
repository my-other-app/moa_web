import type { Metadata } from "next";

import { ResultsPanel } from "@/features/results";

export const metadata: Metadata = { title: "Results" };

export default async function EventResultsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <ResultsPanel eventId={Number(eventId)} />;
}
