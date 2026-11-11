import { redirect } from "next/navigation";

/**
 * The API's name for an event's list: the bell's "gave their ticket back"
 * notice links here (club_alerts kind `ticket_cancelled`). The list is the
 * Attendees tab; the notice lands on its Given back section.
 */
export default async function EventRegistrationsRedirect({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  redirect(`/events/${encodeURIComponent(eventId)}/attendees#given-back`);
}
