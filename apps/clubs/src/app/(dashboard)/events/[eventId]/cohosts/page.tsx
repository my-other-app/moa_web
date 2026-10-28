import type { Metadata } from "next";

import { CohostsPanel } from "@/features/cohosts";

export const metadata: Metadata = { title: "Co-hosts" };

export default async function EventCohostsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <CohostsPanel eventId={Number(eventId)} />;
}
