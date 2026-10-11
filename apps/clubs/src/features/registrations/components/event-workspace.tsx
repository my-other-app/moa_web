"use client";

import * as React from "react";
import Link from "next/link";
import { Button, EmptyState, cn } from "@moa/ui";
import { enter } from "@moa/ui/motion";

import { AnnouncementComposer } from "@/features/announcements";
import { EventOverviewTab } from "@/features/console";
import { useEventDetail } from "@/features/events";
import { EventStatCards } from "./event-stat-cards";
import { EventReviewsPanel } from "@/features/reviews";
import { EventInsightsPanel } from "./event-insights-panel";
import { useEventAnalytics } from "../queries";

/**
 * The event's Overview tab.
 *
 * The console around it carries the name, the status, the actions and the
 * rail, so this is only the panel: the four stat cards, then the door's
 * figures (with the artwork and the description among them), then the
 * announcement composer, the sign-up insights and the reviews. The guest
 * list has its own tab; volunteers are added from Doors.
 */
export function EventWorkspace({ eventId }: { eventId: number }) {
  const { data: event, isError } = useEventDetail(eventId);
  const { data: analytics } = useEventAnalytics(eventId);
  const registered = analytics?.total_registrations ?? 0;

  if (isError) {
    return (
      <EmptyState
        tone="muted"
        title="Could not load this event"
        description="It may have been deleted, or it belongs to another club."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/events">Back to events</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className={cn(enter, "space-y-8")}>
      <EventStatCards event={event} />
      <EventOverviewTab eventId={eventId} event={event} />
      {event ? <AnnouncementComposer eventId={eventId} eventName={event.name} recipientCount={registered} /> : null}
      <EventInsightsPanel eventId={eventId} />
      <EventReviewsPanel eventId={eventId} rating={event?.rating} totalRatings={event?.total_rating} />
    </div>
  );
}
