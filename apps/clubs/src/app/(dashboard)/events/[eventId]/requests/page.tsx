import type { Metadata } from "next";

import { RequestsPage } from "@/features/requests";

export const metadata: Metadata = { title: "Review" };

export default async function EventRequestsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <RequestsPage eventId={Number(eventId)} />;
}
