"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { CalendarOffIcon } from "lucide-react";
import {
  formatDateTime,
  formatNumber,
  pickImage,
  useListParams,
} from "@moa/app-kit";
import { pageCount } from "@moa/api";
import { Button, EmptyState, Pagination, Skeleton, cn } from "@moa/ui";
import { hoverLift, pressable, stagger } from "@moa/ui/motion";

import { Icon } from "@/components/icon";
import { useClubEvents } from "../queries";
import type { ClubEvent } from "../schemas";
import { EventRowActions } from "./event-row-actions";

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
      className={cn(
        "w-[120px] rounded-lg border px-4 py-2 text-center text-base transition-colors",
        "focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-[3px]",
        active
          ? "border-[var(--swatch-ink)] bg-[var(--swatch-ink)] text-white"
          : "border-[var(--swatch-grey)] bg-white font-light text-[var(--swatch-grey)] hover:border-[var(--swatch-ink)] hover:text-[var(--swatch-ink)]",
        pressable
      )}
    >
      {children}
    </button>
  );
}

function EventRow({ event, index }: { event: ClubEvent; index: number }) {
  const poster = pickImage(event.poster, ["thumbnail", "medium", "original"]);
  // "Live" in the design means registration is still open and the event has
  // not finished; the list endpoint already scopes by is_ended, so this only
  // distinguishes within the current scope.
  const isLive = !event.reg_enddate || new Date(event.reg_enddate) > new Date();

  return (
    <div
      style={stagger(index, 40, 240)}
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-1 flex min-h-[100px] items-center gap-4 rounded-lg border border-[var(--swatch-grey)] bg-white px-[22px] py-5 duration-300 motion-reduce:animate-none",
        hoverLift
      )}
    >
      <div className="bg-muted relative size-[60px] shrink-0 overflow-hidden rounded">
        {poster ? (
          <Image src={poster} alt="" fill sizes="60px" className="object-cover" unoptimized />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <Link
          href={`/events/${event.id}`}
          className="block truncate text-xl font-bold text-black underline-offset-4 hover:underline"
        >
          {event.name}
        </Link>
        <div className="mt-1 flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn(
              "size-2 rounded-full",
              isLive ? "bg-[var(--swatch-teal)]" : "bg-[var(--swatch-grey)]"
            )}
          />
          <span
            className={cn(
              "text-xs font-bold",
              isLive ? "text-[var(--swatch-teal)]" : "text-[var(--swatch-grey)]"
            )}
          >
            {isLive ? "Live" : "Closed"}
          </span>
          <span className="text-muted-foreground ml-2 hidden truncate text-xs sm:inline">
            {formatDateTime(event.event_datetime)}
          </span>
        </div>
      </div>

      <div className="hidden w-[119px] shrink-0 flex-col items-center gap-1 text-black md:flex">
        <p className="text-xl font-semibold">
          {formatNumber(event.registration_count ?? 0)}
        </p>
        <p className="text-sm font-light">Registration Count</p>
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
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-6">
          <div className="flex gap-6">
            <FilterChip active={scope === "live"} onClick={() => { setScope("live"); params.setPage(1); }}>
              Live Events
            </FilterChip>
            <FilterChip active={scope === "past"} onClick={() => { setScope("past"); params.setPage(1); }}>
              Past Events
            </FilterChip>
          </div>

          {/* Search styled to the design rather than the shared SearchInput:
              48px tall, grey border, grey placeholder, 24px leading icon. */}
          <div className="flex h-12 w-full items-center gap-1.5 rounded-lg border border-[var(--swatch-grey)] bg-white px-3 lg:w-[401px]">
            <Icon name="search-lg" className="text-[var(--swatch-grey)]" />
            <input
              value={params.searchInput}
              onChange={(e) => params.setSearchInput(e.target.value)}
              placeholder="Search for events"
              aria-label="Search for events"
              className="placeholder:text-[var(--swatch-grey)] w-full bg-transparent text-base font-light outline-none"
            />
          </div>
        </div>

        <Button variant="display" size="display" asChild>
          <Link href="/events/new">Create New Event</Link>
        </Button>
      </div>

      {isPending ? (
        <div className="space-y-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[100px] w-full rounded-lg" />
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

      {!isPending && rows.length > 0 && pages > 1 ? (
        <Pagination
          page={params.page}
          pageCount={pages}
          onPageChange={params.setPage}
          pageSize={params.pageSize}
          onPageSizeChange={params.setPageSize}
        />
      ) : null}
    </div>
  );
}
