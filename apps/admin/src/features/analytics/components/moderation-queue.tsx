"use client";

import Link from "next/link";
import { CalendarXIcon, CheckCircle2Icon, ClockIcon } from "lucide-react";
import { formatDate, formatDateTime, formatNumber } from "@moa/app-kit";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  cn,
} from "@moa/ui";
import { hoverLift, stagger } from "@moa/ui/motion";

import { useModerationQueue } from "../queries";

/**
 * Everything waiting on a decision, in one place.
 *
 * Finding it previously meant visiting five pages to discover there was
 * nothing to do -- or, worse, not discovering that there was.
 */
function Row({
  href,
  title,
  subtitle,
  trailing,
  index,
}: {
  href: string;
  title: string;
  subtitle: string;
  trailing?: string;
  index: number;
}) {
  return (
    <Link
      href={href}
      style={stagger(index)}
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-1 flex items-center gap-3 rounded-lg border p-3 duration-300 motion-reduce:animate-none",
        hoverLift
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        <p className="text-muted-foreground truncate text-xs">{subtitle}</p>
      </div>
      {trailing ? (
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {trailing}
        </span>
      ) : null}
    </Link>
  );
}

export function ModerationQueue() {
  const { data, isPending, isError } = useModerationQueue();

  const pending = data?.pending_clubs ?? [];
  const unreconciled = data?.events_without_attendance ?? [];
  const nothingToDo = !isPending && !isError && pending.length === 0 && unreconciled.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Needs attention</CardTitle>
        <CardDescription>
          Clubs waiting for approval, and events that finished without anyone
          being checked in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Could not load the queue.
          </p>
        ) : nothingToDo ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center text-sm">
            <CheckCircle2Icon className="size-6 text-emerald-600" />
            Nothing is waiting on you.
          </div>
        ) : (
          <>
            {pending.length > 0 ? (
              <section className="space-y-2">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <ClockIcon className="size-4" />
                  Pending clubs ({formatNumber(pending.length)})
                </p>
                {pending.map((club, i) => (
                  <Row
                    key={club.id}
                    href={`/clubs/${club.id}`}
                    title={club.name}
                    subtitle={`Applied ${formatDate(club.created_at)}`}
                    index={i}
                  />
                ))}
              </section>
            ) : null}

            {unreconciled.length > 0 ? (
              <section className="space-y-2">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <CalendarXIcon className="size-4" />
                  Finished with no attendance ({formatNumber(unreconciled.length)})
                </p>
                {unreconciled.map((event, i) => (
                  <Row
                    key={event.id}
                    href={`/events/${event.id}`}
                    title={event.name}
                    subtitle={formatDateTime(event.event_datetime)}
                    trailing={`${formatNumber(event.registration_count)} registered`}
                    index={i}
                  />
                ))}
              </section>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
