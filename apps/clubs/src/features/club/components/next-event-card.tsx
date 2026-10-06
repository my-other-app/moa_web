"use client";

import Link from "next/link";
import {
  ArrowUpRightIcon,
  CalendarDaysIcon,
  EyeIcon,
  MapPinIcon,
  UsersIcon,
} from "lucide-react";
import { formatDateTime, formatNumber } from "@moa/app-kit";
import { Button, Card, CardContent, InlineAlert, StatusBadge, cn } from "@moa/ui";
import { hoverLift, pressable } from "@moa/ui/motion";

import type { ClubEvent } from "@/features/events";
import { CLOSING_SOON_HOURS, hoursUntil, isClosingSoon } from "../insights";

/**
 * The next event, given the space it deserves.
 *
 * A club's overview is almost always read with one question in mind -- what is
 * coming up and is it filling -- and the previous version answered it with a
 * counter labelled "Live events". This is that answer.
 */
function countdown(iso: string | null | undefined): string {
  const hours = hoursUntil(iso);
  if (hours === null) return "Date not set";
  if (hours < 0) return "Started";
  if (hours < 1) return `In ${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 24) return `In ${Math.round(hours)} h`;
  const days = Math.round(hours / 24);
  return `In ${days} ${days === 1 ? "day" : "days"}`;
}

export function NextEventCard({ event }: { event: ClubEvent }) {
  const closing = isClosingSoon(event);
  const registrations = event.registration_count ?? 0;
  const views = event.page_views ?? 0;

  return (
    <Card className={cn("overflow-hidden", hoverLift)}>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs font-medium">Next event</p>
            <h2 className="mt-0.5 truncate text-lg font-semibold">{event.name}</h2>
            <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="flex items-center gap-1">
                <CalendarDaysIcon className="size-3.5" />
                {formatDateTime(event.event_datetime)}
              </span>
              {event.location_name ? (
                <span className="flex items-center gap-1">
                  <MapPinIcon className="size-3.5" />
                  {event.is_online ? "Online" : event.location_name}
                </span>
              ) : null}
            </p>
          </div>
          <StatusBadge
            label={countdown(event.event_datetime)}
            tone={closing ? "warning" : "info"}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground flex items-center gap-1 text-xs">
              <UsersIcon className="size-3.5" /> Registered
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {formatNumber(registrations)}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground flex items-center gap-1 text-xs">
              <EyeIcon className="size-3.5" /> Page views
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {formatNumber(views)}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">Sign-up rate</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {/* Of the people who looked, how many signed up. Hidden rather
                  than shown as 0% when nobody has looked yet. */}
              {views > 0 ? `${Math.round((registrations / views) * 100)}%` : "--"}
            </p>
          </div>
        </div>

        {closing ? (
          <InlineAlert tone="warning" title="Registration closes soon">
            It closes within {CLOSING_SOON_HOURS} hours. Anyone who has not
            signed up by then cannot join on the day.
          </InlineAlert>
        ) : null}

        <div className="flex gap-2">
          <Button size="sm" className={pressable} asChild>
            <Link href={`/events/${event.id}`}>
              Manage event <ArrowUpRightIcon />
            </Link>
          </Button>
          <Button size="sm" variant="outline" className={pressable} asChild>
            <Link href="/announcements">Announce it</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
