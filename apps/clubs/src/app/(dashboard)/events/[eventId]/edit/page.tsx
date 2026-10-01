import type { Metadata } from "next";
import { PageHeader } from "@moa/app-kit";

import { EditEventForm } from "@/features/event-form/components/edit-event-form";

export const metadata: Metadata = { title: "Edit event" };

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  return (
    <>
      <PageHeader title="Edit event" description="Changes are live as soon as you save." />
      <EditEventForm eventId={Number(eventId)} />
    </>
  );
}
