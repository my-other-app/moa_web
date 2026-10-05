"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRightIcon,
  CalendarXIcon,
  CheckCircle2Icon,
  ClockIcon,
} from "lucide-react";
import { formatDate, formatDateTime, formatNumber, initials } from "@moa/app-kit";
import {
  Avatar,
  AvatarFallback,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ProgressMeter,
  Skeleton,
  StatusBadge,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
  type MeterTone,
  type StatusTone,
} from "@moa/ui";
import { hoverLift, stagger } from "@moa/ui/motion";

import { useModerationQueue } from "../queries";

/**
 * Everything waiting on a decision, as cards that say how long it has waited.
 *
 * The previous version was a list of names and dates. A name tells an admin
 * what is in the queue but not which end of it to start at, so each card now
 * carries an age against the review target and sorts the worst to the top --
 * the queue is only useful if it tells you what is going stale.
 */
const REVIEW_TARGET_DAYS = 14;

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

/** Older than the target is overdue; most of the way there is a warning. */
function ageTone(days: number | null): { meter: MeterTone; status: StatusTone } {
  if (days === null) return { meter: "neutral", status: "default" };
  if (days >= REVIEW_TARGET_DAYS) return { meter: "destructive", status: "destructive" };
  if (days >= REVIEW_TARGET_DAYS / 2) return { meter: "warning", status: "warning" };
  return { meter: "brand", status: "info" };
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <p className="truncate text-xs font-medium">{value}</p>
    </div>
  );
}

function AttentionCard({
  href,
  title,
  subtitle,
  status,
  statusTone,
  meter,
  fields,
  index,
}: {
  href: string;
  title: string;
  subtitle: string;
  status: string;
  statusTone: StatusTone;
  meter: {
    value: number;
    total: number;
    leading: string;
    trailing: string;
    tone: MeterTone;
    label: string;
  };
  fields: ReadonlyArray<{ label: string; value: React.ReactNode }>;
  index: number;
}) {
  return (
    <div
      style={stagger(index)}
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-1 bg-card flex flex-col gap-3 rounded-xl border p-4 duration-300 motion-reduce:animate-none",
        hoverLift
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar className="size-9 shrink-0">
          <AvatarFallback className="text-[11px]">{initials(title)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="text-muted-foreground truncate text-xs">{subtitle}</p>
        </div>
        <StatusBadge label={status} tone={statusTone} className="shrink-0" />
      </div>

      <ProgressMeter
        value={meter.value}
        total={meter.total}
        leading={meter.leading}
        trailing={meter.trailing}
        tone={meter.tone}
        label={meter.label}
      />

      <div className="mt-auto flex items-end justify-between gap-3 border-t pt-3">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-3">
          {fields.map((field) => (
            <Field key={field.label} label={field.label} value={field.value} />
          ))}
        </div>
        <Link
          href={href}
          aria-label={`Open ${title}`}
          className="hover:bg-accent flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors"
        >
          <ArrowUpRightIcon className="size-4" />
        </Link>
      </div>
    </div>
  );
}

type Filter = "all" | "clubs" | "events";

export function AttentionPanel() {
  const { data, isPending, isError } = useModerationQueue();
  const [filter, setFilter] = React.useState<Filter>("all");

  // Oldest application first: the queue exists to surface what is going stale,
  // so the order has to reflect that rather than whatever the API returned.
  const clubs = React.useMemo(() => {
    const rows = data?.pending_clubs ?? [];
    return [...rows].sort(
      (a, b) => (daysSince(b.created_at) ?? 0) - (daysSince(a.created_at) ?? 0)
    );
  }, [data]);

  const events = React.useMemo(() => {
    const rows = data?.events_without_attendance ?? [];
    return [...rows].sort((a, b) => b.registration_count - a.registration_count);
  }, [data]);

  const total = clubs.length + events.length;
  const showClubs = filter === "all" || filter === "clubs";
  const showEvents = filter === "all" || filter === "events";

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Needs attention</CardTitle>
            <CardDescription>
              Clubs waiting for approval, and events that finished without anyone
              being checked in.
            </CardDescription>
          </div>
          {total > 0 ? (
            <StatusBadge
              label={`${formatNumber(total)} open`}
              tone={total > 10 ? "destructive" : "warning"}
            />
          ) : null}
        </div>

        {total > 0 ? (
          <Tabs value={filter} onValueChange={(next) => setFilter(next as Filter)}>
            <TabsList>
              <TabsTrigger value="all">All ({formatNumber(total)})</TabsTrigger>
              <TabsTrigger value="clubs">
                Clubs ({formatNumber(clubs.length)})
              </TabsTrigger>
              <TabsTrigger value="events">
                Events ({formatNumber(events.length)})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
      </CardHeader>

      <CardContent>
        {isPending ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[11rem] w-full rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Could not load the queue.
          </p>
        ) : total === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
            <CheckCircle2Icon className="size-6 text-emerald-600" />
            Nothing is waiting on you.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {showClubs &&
              clubs.map((club, i) => {
                const age = daysSince(club.created_at);
                const tone = ageTone(age);
                return (
                  <AttentionCard
                    key={`club-${club.id}`}
                    index={i}
                    href={`/clubs/${club.id}`}
                    title={club.name}
                    subtitle="Club · awaiting approval"
                    status={
                      age !== null && age >= REVIEW_TARGET_DAYS ? "Overdue" : "Pending"
                    }
                    statusTone={tone.status}
                    meter={{
                      value: age ?? 0,
                      total: REVIEW_TARGET_DAYS,
                      leading:
                        age === null
                          ? "Waiting"
                          : `Waiting ${age} ${age === 1 ? "day" : "days"}`,
                      trailing: `${REVIEW_TARGET_DAYS}-day target`,
                      tone: tone.meter,
                      label: "Days waiting against the review target",
                    }}
                    fields={[
                      { label: "Applied", value: formatDate(club.created_at) },
                      { label: "Can publish", value: "Not until approved" },
                    ]}
                  />
                );
              })}

            {showEvents &&
              events.map((event, i) => (
                <AttentionCard
                  key={`event-${event.id}`}
                  index={clubs.length + i}
                  href={`/events/${event.id}`}
                  title={event.name}
                  subtitle="Event · attendance not marked"
                  status="Unreconciled"
                  statusTone="warning"
                  meter={{
                    // Nobody was checked in, which is the whole point: the empty
                    // bar against a real registration count is the signal.
                    value: 0,
                    total: Math.max(1, event.registration_count),
                    leading: "0 checked in",
                    trailing: `${formatNumber(event.registration_count)} registered`,
                    tone: "destructive",
                    label: "Attendees checked in against registrations",
                  }}
                  fields={[
                    { label: "Held", value: formatDateTime(event.event_datetime) },
                    {
                      label: "Registered",
                      value: formatNumber(event.registration_count),
                    },
                  ]}
                />
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
