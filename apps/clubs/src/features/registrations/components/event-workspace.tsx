"use client";

import * as React from "react";
import Link from "next/link";
import { formatNumber } from "@moa/app-kit";
import { Button, EmptyState, FigurePanel, cn } from "@moa/ui";
import { enter } from "@moa/ui/motion";

import { useAccess } from "@/features/access";
import { AskPanel, MoveAnswersDialog, answersAttention, useAnswersSummary, type AskTarget } from "@/features/answers";
import { EventOverviewTab, type OverviewAttention } from "@/features/console";
import { useEventDetail } from "@/features/events";
import { EventReviewsPanel } from "@/features/reviews";
import { EventRequestsFunnel } from "@/features/requests";
import { TicketSalesCard } from "@/features/ticketing";
import { useEventAnalytics } from "../queries";
import { EventInsightsPanel } from "./event-insights-panel";
import { EventStatCards } from "./event-stat-cards";
import { NotifyGuestsPanel } from "./notify-guests-panel";

/**
 * The event's Overview tab.
 *
 * The console around it carries the name, the status, the actions and the
 * rail; the console's overview owns the layout. This supplies the pieces
 * that read the sign-up analytics — the headline figures, the sign-ups,
 * and the unpaid registrations among what needs attention — with the way to
 * notify guests and what attendees said. The guest list has its own tab;
 * volunteers are added from Doors.
 */
export function EventWorkspace({ eventId }: { eventId: number }) {
  const { data: event, isError } = useEventDetail(eventId);
  const { data: analytics } = useEventAnalytics(eventId);
  // Missing answers (missing-answers contract §3 item 3): asking is for whoever can write to the
  // guests; moving answers left under an old question is the owner's and admins'.
  const access = useAccess();
  const answers = useAnswersSummary(eventId);
  const [ask, setAsk] = React.useState<AskTarget | null>(null);
  const [moving, setMoving] = React.useState<{ key: string; count: number } | null>(null);
  const mayAsk = Boolean(access.can.edit_events);
  const mayMove = access.role === "owner" || access.role === "admin";

  if (isError) {
    return (
      <FigurePanel>
        <EmptyState
          title="Could not load this event"
          description="It may have been deleted, or it belongs to another club."
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/events">Back to events</Link>
            </Button>
          }
        />
      </FigurePanel>
    );
  }

  const unpaid = event?.has_fee ? (analytics?.payment_status?.unpaid ?? 0) : 0;
  const attention: OverviewAttention[] =
    unpaid > 0
      ? [
          {
            kind: "UNPAID",
            tone: "amber",
            title: `${formatNumber(unpaid)} ${unpaid === 1 ? "registration has" : "registrations have"} not paid`,
            body: "Their places are held but the money is not in. The guest list shows who; Finance has the totals.",
            path: "/attendees?paid=no",
          },
        ]
      : [];
  for (const item of answersAttention(answers.data, { ask: mayAsk, move: mayMove })) {
    const { action, ...rest } = item;
    attention.push({
      ...rest,
      onSelect: action === "ask" ? () => setAsk({}) : action ? () => setMoving(action.move) : undefined,
    });
  }

  return (
    <div className={cn(enter)}>
      <EventOverviewTab
        eventId={eventId}
        event={event}
        attention={attention}
        figures={<EventStatCards eventId={eventId} event={event} />}
        signups={
          <>
            {/* Registration review: from registering to the door, with the places. */}
            <EventRequestsFunnel eventId={eventId} event={event} />
            {/* Per ticket type, once the event sells more than one (or a code or a waiting list is in play). */}
            <TicketSalesCard eventId={eventId} />
            <EventInsightsPanel eventId={eventId} pageViews={event?.page_views} />
          </>
        }
        notify={event ? <NotifyGuestsPanel eventId={eventId} eventName={event.name} recipientCount={analytics?.total_registrations ?? 0} /> : undefined}
        reviews={
          <EventReviewsPanel
            eventId={eventId}
            rating={event?.rating}
            totalRatings={event?.total_rating}
            finished={event?.status === "closed" || event?.status === "archived"}
          />
        }
      />
      {mayAsk ? <AskPanel eventId={eventId} target={ask} onOpenChange={(o) => !o && setAsk(null)} /> : null}
      {moving && answers.data ? <MoveAnswersDialog eventId={eventId} stray={moving} questions={answers.data.questions} onClose={() => setMoving(null)} /> : null}
    </div>
  );
}
