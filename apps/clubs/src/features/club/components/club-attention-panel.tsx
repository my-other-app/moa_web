"use client";

import Link from "next/link";
import { CheckCircle2Icon, ClipboardCheckIcon } from "lucide-react";
import { formatDate, formatNumber } from "@moa/app-kit";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  InlineAlert,
  cn,
} from "@moa/ui";
import { hoverLift, stagger } from "@moa/ui/motion";

import type { ClubEvent } from "@/features/events";

/**
 * Events that finished with nobody marked present.
 *
 * Attendance is what certificates and winners are issued from, so this is not
 * housekeeping: every row here is a group of people who turned up and have
 * nothing to show for it. Nothing in the product surfaced it before.
 */
export function ClubAttentionPanel({
  events,
}: {
  events: readonly ClubEvent[];
}) {
  return (
    <Card className="rounded-2xl shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-14px_rgba(16,24,40,0.12)]">
      <CardHeader>
        <CardTitle className="text-base">Needs attention</CardTitle>
        <CardDescription>
          Finished events where nobody was marked present.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {events.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 py-6 text-center text-sm">
            <CheckCircle2Icon className="size-6 text-emerald-600" />
            Everything is up to date.
          </div>
        ) : (
          <>
            <InlineAlert tone="warning">
              Certificates and winners are issued from attendance, so these
              attendees cannot be awarded anything until it is marked.
            </InlineAlert>

            {events.map((event, i) => (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                style={stagger(i)}
                className={cn(
                  "animate-in fade-in-0 slide-in-from-bottom-1 bg-muted/40 hover:bg-muted/70 flex items-center gap-3 rounded-xl p-3.5 transition-colors duration-200 motion-reduce:animate-none motion-reduce:transition-none",
                )}
              >
                <ClipboardCheckIcon className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{event.name}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {formatDate(event.event_datetime)} ·{" "}
                    {formatNumber(event.registration_count ?? 0)} registered
                  </p>
                </div>
              </Link>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
