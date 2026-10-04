import type { Metadata } from "next";

import { EventDetail } from "@/features/events";

export const metadata: Metadata = { title: "Event" };

export default async function EventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return <EventDetail eventId={Number(eventId)} />;
}
