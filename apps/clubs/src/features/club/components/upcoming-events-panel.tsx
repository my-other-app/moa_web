"use client";

import Link from "next/link";
import { ArrowUpRightIcon, CalendarPlusIcon } from "lucide-react";
import { formatDateTime, formatNumber } from "@moa/app-kit";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ProgressMeter,
  StatusBadge,
  cn,
} from "@moa/ui";
import { hoverLift, pressable, stagger } from "@moa/ui/motion";

import type { ClubEvent } from "@/features/events";
import { hoursUntil, isClosingSoon } from "../insights";

/**
 * The rest of the schedule, with how each one is filling.
 *
 * The bar is registrations against the best-performing upcoming event rather
 * than against a capacity, because the API has no capacity field. That makes
 * it a comparison between your own events, which is the honest reading -- and
 * it is labelled that way rather than implying a target nobody set.
 */
export function UpcomingEventsPanel({ events }: { events: readonly ClubEvent[] }) {
  const best = Math.max(1, ...events.map((e) => e.registration_count ?? 0));

  return (
    <Card className="rounded-2xl shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-14px_rgba(16,24,40,0.12)]">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Coming up</CardTitle>
            <CardDescription>
              Registrations so far, compared with your best-attended upcoming
              event.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" className={pressable} asChild>
            <Link href="/events/new">
              <CalendarPlusIcon /> New event
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {events.length === 0 ? (
          <EmptyState
            tone="muted"
            title="Nothing scheduled"
            description="Create an event and it will appear here with its sign-ups."
            action={
              <Button size="sm" asChild>
                <Link href="/events/new">Create an event</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {events.map((event, i) => {
              const registrations = event.registration_count ?? 0;
              const hours = hoursUntil(event.event_datetime);
              return (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  style={stagger(i)}
                  className={cn(
                    "animate-in fade-in-0 slide-in-from-bottom-1 bg-muted/40 hover:bg-muted/70 block rounded-xl p-4 transition-colors duration-200 motion-reduce:animate-none motion-reduce:transition-none"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold">{event.name}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {formatDateTime(event.event_datetime)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {isClosingSoon(event) ? (
                        <StatusBadge label="Closing soon" tone="warning" />
                      ) : hours !== null && hours < 24 ? (
                        <StatusBadge label="Today" tone="info" />
                      ) : null}
                      <ArrowUpRightIcon className="text-muted-foreground size-4" />
                    </div>
                  </div>

                  <ProgressMeter
                    className="mt-2.5"
                    value={registrations}
                    total={best}
                    tone={registrations === 0 ? "neutral" : "brand"}
                    leading={`${formatNumber(registrations)} registered`}
                    trailing={
                      registrations === 0
                        ? "no sign-ups yet"
                        : `${formatNumber(event.page_views ?? 0)} views`
                    }
                    label="Registrations compared with your best upcoming event"
                  />
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
