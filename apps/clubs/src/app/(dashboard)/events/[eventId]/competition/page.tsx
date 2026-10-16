import type { Metadata } from "next";

import { CompetitionPage } from "@/features/competition";

export const metadata: Metadata = { title: "Competition" };

export default async function EventCompetitionPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <CompetitionPage eventId={Number(eventId)} />;
}
