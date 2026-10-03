"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, ImageOffIcon } from "lucide-react";
import { PageHeader, pickImage } from "@moa/app-kit";
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

import { Icon } from "@/components/icon";
import { AnnouncementComposer } from "@/features/announcements";
import { EventRowActions, useEventDetail } from "@/features/events";
import { VolunteersPanel } from "@/features/volunteers";
import { EventStatCards } from "./event-stat-cards";
import { RegistrationsPanel } from "./registrations-panel";
import { useEventAnalytics } from "../queries";

/**
 * Event screen from the design (node 158:260).
 *
 * Top row: the event name, the three icon actions and Add Volunteers. Below
 * it a 600px poster beside the four stat cards and the announcement composer,
 * then the registrations table.
 *
 * Volunteers are a dialog rather than the design's second tab: the design's
 * tabs are Registration and Attendance, which are two views of one list, and
 * there is nowhere on the screen for a third panel. The button the design
 * gives them is the one that opens it.
 */
export function EventWorkspace({ eventId }: { eventId: number }) {
  const router = useRouter();
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
    <div className={cn(enter)}>
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
        <Link href="/events">
          <ArrowLeftIcon /> All events
        </Link>
      </Button>

      <PageHeader
        title={event?.name ?? "Event"}
        action={
          <div className="flex items-center gap-4 sm:gap-6">
            {event ? (
              <EventRowActions
                event={{
                  id: event.id,
                  name: event.name,
                  registration_count: registered,
                }}
                // Nothing left to show once it is gone.
                onDeleted={() => router.replace("/events")}
              />
            ) : null}

            <Button
              type="button"
              onClick={() => setVolunteersOpen(true)}
              className={cn(
                "h-12 shrink-0 gap-2 rounded-lg bg-[var(--swatch-ink)] px-4 text-base font-medium text-white hover:bg-[var(--swatch-ink)]/90",
                pressable
              )}
            >
              <Icon name="user-plus-01" />
              Add Volunteers
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,600px)_minmax(0,1fr)]">
        <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-[#f3f3f3]">
          {isPending ? (
            <Skeleton className="size-full" />
          ) : poster ? (
            <Image
              src={poster}
              alt={`Poster for ${event?.name ?? "this event"}`}
              fill
              sizes="(min-width: 1280px) 600px, 100vw"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="grid size-full place-items-center text-[var(--swatch-grey)]">
              <div className="flex flex-col items-center gap-2">
                <ImageOffIcon className="size-8" />
                <p className="text-sm">No poster</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <EventStatCards event={event} />

          {event ? (
            <AnnouncementComposer
              eventId={eventId}
              eventName={event.name}
              recipientCount={registered}
            />
          ) : (
            <Skeleton className="h-[280px] w-full rounded-lg" />
          )}
        </div>
      </div>

      <div className="mt-11">
        <RegistrationsPanel eventId={eventId} />
      </div>

      <Dialog open={volunteersOpen} onOpenChange={setVolunteersOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="bebas text-2xl tracking-wide uppercase">
              Volunteers
            </DialogTitle>
          </DialogHeader>
          <VolunteersPanel eventId={eventId} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
