import type { Metadata } from "next";
import { PageHeader } from "@moa/app-kit";

import { EventForm } from "@/features/event-form";

export const metadata: Metadata = { title: "New event" };

export default function NewEventPage() {
  return (
    <>
      <PageHeader
        title="New event"
        description="Publish an event for your club. You can edit everything afterwards."
      />
      <EventForm mode="create" />
    </>
  );
}
