"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ImageOffIcon, UsersIcon } from "lucide-react";
import { pickImage } from "@moa/app-kit";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Skeleton,
  cn,
} from "@moa/ui";
import { enter, pressable } from "@moa/ui/motion";

import { AnnouncementComposer } from "@/features/announcements";
import { EventOverviewTab } from "@/features/console";
import { useEventDetail } from "@/features/events";
import { VolunteersPanel } from "@/features/volunteers";
import { EventStatCards } from "./event-stat-cards";
import { EventReviewsPanel } from "@/features/reviews";
import { EventInsightsPanel } from "./event-insights-panel";
import { useEventAnalytics } from "../queries";

/**
 * The event's Overview tab.
 *
 * The console around it carries the name, the status, the actions and the
 * rail, so this is only the panel: the poster beside the four stat cards and
 * the announcement composer, then the door's figures, then the sign-up
 * insights and the reviews. The guest list has its own tab.
 *
 * Volunteers are a dialog rather than a tab: the team page sets what each
 * may do at the door; this is where they are added.
 */
export function EventWorkspace({ eventId }: { eventId: number }) {
  const [volunteersOpen, setVolunteersOpen] = React.useState(false);
  const { data: event, isPending, isError } = useEventDetail(eventId);
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

  const poster = pickImage(event?.poster, ["large", "medium", "original", "thumbnail"]);

  return (
    <div className={cn(enter, "space-y-8")}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="bg-muted relative aspect-square w-full overflow-hidden rounded-2xl">
          {isPending ? (
            <Skeleton className="size-full" />
          ) : poster ? (
            <Image src={poster} alt={`Poster for ${event?.name ?? "this event"}`} fill sizes="(min-width: 1280px) 420px, 100vw" className="object-cover" unoptimized />
          ) : (
            <div className="text-muted-foreground grid size-full place-items-center">
              <div className="flex flex-col items-center gap-2">
                <ImageOffIcon className="size-8" />
                <p className="text-sm">No poster</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-end">
            <Button type="button" variant="outline" onClick={() => setVolunteersOpen(true)} className={cn("gap-2", pressable)}>
              <UsersIcon /> Add Volunteers
            </Button>
          </div>
          <EventStatCards event={event} />
          {event ? <AnnouncementComposer eventId={eventId} eventName={event.name} recipientCount={registered} /> : <Skeleton className="h-[280px] w-full rounded-lg" />}
        </div>
      </div>

      <EventOverviewTab eventId={eventId} event={event} />

      <EventInsightsPanel eventId={eventId} />
      <EventReviewsPanel eventId={eventId} rating={event?.rating} totalRatings={event?.total_rating} />

      <Dialog open={volunteersOpen} onOpenChange={setVolunteersOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl">Volunteers</DialogTitle>
          </DialogHeader>
          <VolunteersPanel eventId={eventId} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
