"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { CalendarOffIcon, EyeIcon, MapPinIcon, PlusIcon } from "lucide-react";
import {
  formatDateTime,
  formatNumber,
  pickImage,
  useListParams,
} from "@moa/app-kit";
import { pageCount } from "@moa/api";
import { Button, EmptyState, Pager, ProgressBar, Skeleton, cn } from "@moa/ui";
import { hoverLift, pressable, stagger } from "@moa/ui/motion";

import { Icon } from "@/components/icon";
import { useClubEvents } from "../queries";
import type { ClubEvent } from "../schemas";
import { EventRowActions } from "./event-row-actions";
import { EventStatusBadge } from "./event-status-badge";

type Scope = "live" | "past";

/**
 * Events list from the design (node 3:791).
 *
 * Deliberately not built on the shared ResourceList: that renders a table, and
 * the design is a stack of bordered row cards with a 60px poster, a status
 * dot, a centred count and three square action buttons. Forcing it through the
 * table scaffold would mean overriding almost every cell.
 */
function FilterChip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      /*
       * One segmented control rather than two independent buttons. They were
       * a filled pill beside an outlined one, which reads as two unrelated
       * actions instead of a choice between two states -- and both hardcoded
       * white and grey, so neither survived dark mode.
       */
      className={cn(
        "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
        "focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-[3px]",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
        pressable
      )}
    >
      {children}
    </button>
  );
}

function EventRow({ event, index }: { event: ClubEvent; index: number }) {
  const poster = pickImage(event.poster, ["thumbnail", "medium", "original"]);
  const registered = event.registration_count ?? 0;
  const attended = event.attended_count ?? 0;

  return (
    <div
      style={stagger(index, 40, 240)}
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-1 bg-card ring-border/70 flex items-center gap-4 rounded-2xl p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-16px_rgba(16,24,40,0.12)] ring-1 duration-300 motion-reduce:animate-none",
        hoverLift
      )}
    >
      {/* An empty dark square read as a broken image; without a poster the
          tile now carries the event's initial instead. */}
      <div className="bg-muted text-muted-foreground relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl text-base font-semibold">
        {poster ? (
          <Image src={poster} alt="" fill sizes="56px" className="object-cover" unoptimized />
        ) : (
          <span aria-hidden="true">{event.name.trim().charAt(0).toUpperCase()}</span>
        )}
      </div>

      <div className="min-w-0 max-w-[22rem] flex-1 lg:flex-none lg:basis-[20rem]">
        <Link
          href={`/events/${event.id}`}
          className="text-foreground block truncate text-[15px] font-semibold underline-offset-4 hover:underline"
        >
          {event.name}
        </Link>
        <div className="mt-1 flex items-center gap-1.5">
          {/* The status clock, not a guess from the registration deadline. */}
          <EventStatusBadge status={event.status} />
          <span className="text-muted-foreground ml-1 hidden truncate text-xs sm:inline">
            {formatDateTime(event.event_datetime)}
          </span>
        </div>
      </div>

      {/*
       * The row ran a name on the left and a count on the right with a third
       * of the width empty between them. These are the two things a club
       * checks next -- where it is, and whether anyone is looking at it.
       */}
      <div className="text-muted-foreground hidden min-w-0 flex-1 items-center gap-5 text-xs lg:flex">
        {event.location_name ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPinIcon className="size-3.5 shrink-0" />
            <span className="truncate">
              {event.is_online ? "Online" : event.location_name}
            </span>
          </span>
        ) : null}
        <span className="flex shrink-0 items-center gap-1.5">
          <EyeIcon className="size-3.5" />
          {formatNumber(event.page_views ?? 0)} views
        </span>
      </div>

      {/* Label under the figure and in the same voice as the rest of the
          product -- "Registration Count" was title-cased and twice the width
          of the number it described. */}
      <div className="hidden w-32 shrink-0 md:block">
        <p className="text-foreground text-right text-xl leading-none font-semibold tabular-nums">
          {formatNumber(registered)}
        </p>
        <p className="text-muted-foreground mt-1 text-right text-xs">registered</p>
        {registered > 0 ? (
          <div className="mt-1.5 flex items-center gap-1.5">
            <ProgressBar value={attended} max={registered} height={6} tone={event.status === "live" ? "admit" : "muted"} label={`${event.name} checked in`} />
            <span className="text-muted-foreground shrink-0 font-mono text-[10.5px] tabular-nums">{attended}</span>
          </div>
        ) : null}
      </div>

      <EventRowActions event={event} />
    </div>
  );
}

export function ClubEventsList() {
  const params = useListParams();
  const [scope, setScope] = React.useState<Scope>("live");

  const { data, isPending, isError } = useClubEvents({
    search: params.search || undefined,
    isEnded: scope === "past",
    offset: params.offset,
    limit: params.pageSize,
  });

  const rows = data?.items.slice(0, params.pageSize) ?? [];
  const pages = pageCount(data?.total ?? null, params.pageSize) ?? 1;

  return (
    <div className="space-y-6">
      {/* One toolbar row: the choice, the search and the action together,
          rather than three stacked rows with 24px between them. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div
            role="group"
            aria-label="Event scope"
            className="bg-muted inline-flex w-fit gap-1 rounded-lg p-1"
          >
            <FilterChip active={scope === "live"} onClick={() => { setScope("live"); params.setPage(1); }}>
              Live
            </FilterChip>
            <FilterChip active={scope === "past"} onClick={() => { setScope("past"); params.setPage(1); }}>
              Past
            </FilterChip>
          </div>

          {/* Search styled to the design rather than the shared SearchInput:
              48px tall, grey border, grey placeholder, 24px leading icon. */}
          <div className="bg-card ring-border flex h-11 w-full items-center gap-2 rounded-xl px-3 ring-1 lg:w-[360px]">
            <Icon name="search-lg" className="text-muted-foreground" />
            <input
              value={params.searchInput}
              onChange={(e) => params.setSearchInput(e.target.value)}
              placeholder="Search for events"
              aria-label="Search for events"
              className="placeholder:text-muted-foreground text-foreground w-full bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        <Button asChild className="shrink-0">
          <Link href="/events/new">
            <PlusIcon /> New event
          </Link>
        </Button>
      </div>

      {isPending ? (
        <div className="space-y-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] w-full rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          tone="muted"
          icon={<CalendarOffIcon />}
          title="Could not load your events"
          description="Try reloading the page."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          tone="muted"
          icon={<CalendarOffIcon />}
          title={params.search ? "No matches" : scope === "past" ? "No past events" : "No live events"}
          description={
            params.search
              ? `Nothing matched “${params.search}”.`
              : scope === "past"
                ? "Events that have finished will appear here."
                : "Publish an event and it will show up here with its registration count."
          }
          action={
            params.search ? (
              <button type="button" onClick={params.reset} className="text-primary text-sm underline-offset-4 hover:underline">
                Clear search
              </button>
            ) : null
          }
        />
      ) : (
        <div className="space-y-6">
          {rows.map((event, i) => (
            <EventRow key={event.id} event={event} index={i} />
          ))}
        </div>
      )}

      {!isPending && rows.length > 0 ? (
        <Pager page={params.page} pageCount={pages} total={data?.total ?? rows.length} pageSize={params.pageSize} noun={["event", "events"]} onPage={params.setPage} onPageSize={params.setPageSize} />
      ) : null}
    </div>
  );
}
