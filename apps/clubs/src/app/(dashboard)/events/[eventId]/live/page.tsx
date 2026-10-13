import type { Metadata } from "next";

import { LivePage } from "@/features/live";

export const metadata: Metadata = { title: "Live" };

export default async function EventLivePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <LivePage eventId={Number(eventId)} />;
}
