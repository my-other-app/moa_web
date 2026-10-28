"use client";

import { RequestFunnelCard, hasRequestFigures } from "@moa/app-kit";

// The query, not the feature's surface: the console's components reach this feature.
import { useEventSummary } from "@/features/console/queries";
import type { EventDetail } from "@/features/events";

/**
 * On the event's Overview, for an event that confirms each registration (or
 * ever did): who asked, who waits, who was confirmed and paid, who came, and
 * the places as the server counts them. Nothing from a server without the
 * figures, nor for an event that never asked anyone to wait.
 */
export function EventRequestsFunnel({ eventId, event }: { eventId: number; event: EventDetail | undefined }) {
  const summary = useEventSummary(eventId);
  const s = summary.data;
  const requests = s?.requests;
  if (!s || !hasRequestFigures(requests)) return null;
  return (
    <RequestFunnelCard
      requests={requests}
      places={s.places}
      // A paid event by its fee; otherwise the figures say (ticket types can be paid on a "free" event).
      paidEvent={event?.has_fee ? true : undefined}
      pageViews={event?.page_views}
      requestsHref={`/events/${eventId}/requests`}
      now={new Date(s.generated_at)}
    />
  );
}
