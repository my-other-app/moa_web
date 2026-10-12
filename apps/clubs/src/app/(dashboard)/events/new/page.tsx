import type { Metadata } from "next";

import { EventForm } from "@/features/event-form";

export const metadata: Metadata = { title: "New event" };

export default function NewEventPage() {
  return <EventForm mode="create" />;
}
