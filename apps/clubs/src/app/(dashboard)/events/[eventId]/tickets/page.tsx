import type { Metadata } from "next";

import { TicketsPage } from "@/features/ticketing";

export const metadata: Metadata = { title: "Tickets" };

export default async function EventTicketsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <TicketsPage eventId={Number(eventId)} />;
}
