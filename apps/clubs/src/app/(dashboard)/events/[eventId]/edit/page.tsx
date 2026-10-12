import type { Metadata } from "next";

import { EditEventForm } from "@/features/event-form";

export const metadata: Metadata = { title: "Edit event" };

export default async function EditEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <EditEventForm eventId={Number(eventId)} />;
}
