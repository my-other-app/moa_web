import type { Metadata } from "next";

import { EventPaymentsPage } from "@/features/event-payments";

export const metadata: Metadata = { title: "Payments" };

export default async function EventPaymentsRoute({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <EventPaymentsPage eventId={Number(eventId)} />;
}
