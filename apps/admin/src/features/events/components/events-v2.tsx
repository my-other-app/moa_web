"use client";

import * as React from "react";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { formatNumber, useListParams } from "@moa/app-kit";
import { InlineAlert, Skeleton, cn } from "@moa/ui";

import { ExportButton } from "@/components/export-button";
import { SavedViews } from "@/components/saved-views";
import { useClubs } from "@/features/clubs";
import { fetchEvents, type EventListQuery } from "../api";
import { useEventCategories, useEvents } from "../queries";
import type { AdminEvent } from "../schemas";
import { UNDER_REVIEW_ANCHOR } from "./under-review-section";

/**
 * The v2 Events screen.
 *
 * Built around one row: an event that has finished, has registrations, and
 * has nobody marked present. Certificates and winners are both blocked until
 * the club marks attendance, so those are the events an admin needs to chase
 * -- and they were invisible, because the list reported neither count.
 *
 * That is why "Present" reads "Not marked" in the accent colour rather than
 * showing 0. Zero marked and zero registered are the same number and entirely
 * different situations.
 */
const PAGE_SIZE = 25;

const SORT_OPTIONS = [
  { value: "date", label: "Sort: date" },
  { value: "created", label: "Sort: created" },
  { value: "name", label: "Sort: name" },
  { value: "views", label: "Sort: views" },
] as const;

const FEE_OPTIONS = [
  { value: "", label: "Any fee" },
  { value: "paid", label: "Paid" },
  { value: "free", label: "Free" },
] as const;

type Period = "all" | "upcoming" | "ended";

const GRID =
  "grid grid-cols-[52px_minmax(0,1fr)_auto] gap-3 md:grid-cols-[60px_minmax(220px,2fr)_minmax(150px,1.2fr)_110px_80px_80px_90px_100px]";

const WIDE_ONLY = "hidden md:block";

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

/**
 * The whole filtered list as a file, and the filter combinations worth
 * keeping. Both read the same URL as the list, so what downloads or reopens
 * is what is on screen.
 */
const EVENT_CSV = [
  { header: "ID", value: (e: AdminEvent) => e.id },
  { header: "Name", value: (e: AdminEvent) => e.name },
  { header: "Club", value: (e: AdminEvent) => e.club?.name ?? "" },
  { header: "Category", value: (e: AdminEvent) => e.category?.name ?? "" },
  { header: "When", value: (e: AdminEvent) => e.event_datetime ?? "" },
  { header: "Where", value: (e: AdminEvent) => e.location_name ?? "" },
  { header: "Online", value: (e: AdminEvent) => (e.is_online ? "yes" : "no") },
  { header: "Fee", value: (e: AdminEvent) => (e.has_fee ? e.reg_fee ?? 0 : 0) },
  { header: "Page views", value: (e: AdminEvent) => e.page_views ?? 0 },
  { header: "Reviews registrations", value: (e: AdminEvent) => (e.requires_approval ? "yes" : "no") },
  { header: "Registrations under review", value: (e: AdminEvent) => e.requests_pending ?? "" },
  { header: "Registrations received for review", value: (e: AdminEvent) => e.requests_total ?? "" },
] as const;

const EVENT_VIEWS = [
  { name: "Upcoming", query: "period=upcoming&sort=date" },
  { name: "Paid events", query: "fee=paid" },
  { name: "Most viewed", query: "sort=views" },
] as const;

interface EventRowView {
  month: string;
  day: string;
  state: string;
  stateClass: string;
  present: string;
  presentClass: string;
  fee: string;
}

/**
 * Everything the row says about an event's moment in time.
 *
 * One function because the values have to agree: an event cannot read
 * "Upcoming" in one cell and carry a turnout figure in another.
 *
 * "Today" is a local-day comparison. The API stores instants in UTC, but an
 * admin in Pune means the Indian day, and an event at 00:30 IST is on the
 * day they would say it is -- not the UTC day it technically falls in.
 */
export function rowView(event: AdminEvent, now: Date): EventRowView {
  const when = event.event_datetime ? new Date(event.event_datetime) : null;
  const valid = when !== null && !Number.isNaN(when.getTime());
  const ended = valid && when.getTime() < now.getTime();
  const sameDay =
    valid &&
    when.getFullYear() === now.getFullYear() &&
    when.getMonth() === now.getMonth() &&
    when.getDate() === now.getDate();

  // Unmarked: the event is over, people registered, and nobody was checked
  // in. Said in words and in the accent colour, because the alternative --
  // a plain "0" -- is indistinguishable from an event nobody came to.
  const unmarked = ended && event.registration_count > 0 && event.attended_count === 0;

  return {
    month: valid ? MONTHS[when.getMonth()]! : "—",
    day: valid ? String(when.getDate()) : "",
    state: sameDay ? "Today" : ended ? "Ended" : "Upcoming",
    stateClass: ended
      ? "text-ink-3"
      : "text-brand",
    present: !ended
      ? "—"
      : unmarked
        ? "Not marked"
        : formatNumber(event.attended_count),
    presentClass: unmarked ? "text-brand" : "text-ink",
    fee: event.has_fee && event.reg_fee ? `₹${formatNumber(event.reg_fee)}` : "Free",
  };
}

function RowsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className={cn(GRID, "rule-fade items-center px-1.5 py-2.5")}>
          <Skeleton className="h-8 w-10" />
          <Skeleton className="h-3.5 w-44" />
          <Skeleton className={cn(WIDE_ONLY, "h-3.5 w-28")} />
          <Skeleton className={cn(WIDE_ONLY, "h-3.5 w-20")} />
          <Skeleton className={cn(WIDE_ONLY, "ml-auto h-3.5 w-10")} />
          <Skeleton className={cn(WIDE_ONLY, "ml-auto h-3.5 w-8")} />
          <Skeleton className={cn(WIDE_ONLY, "ml-auto h-3.5 w-12")} />
          <Skeleton className="ml-auto h-3.5 w-10" />
        </div>
      ))}
    </div>
  );
}

export function EventsV2() {
  const params = useListParams({ pageSize: PAGE_SIZE });

  const search = params.search;
  const clubParam = params.param("club");
  const categoryParam = params.param("category");
  const feeParam = params.param("fee");
  const period = (params.param("period") ?? "all") as Period;
  const sort = params.param("sort") ?? "date";

  const filters: Omit<EventListQuery, "offset" | "limit"> = {
    search: search || undefined,
    clubId: clubParam ? Number(clubParam) : undefined,
    categoryId: categoryParam ? Number(categoryParam) : undefined,
    isEnded: period === "all" ? undefined : period === "ended",
    hasFee: feeParam === "" || feeParam === undefined ? undefined : feeParam === "paid",
    sort,
    order: sort === "name" ? "asc" : "desc",
  };
  const { data, isPending, isError, error, isPlaceholderData } = useEvents({
    ...filters,
    offset: params.offset,
    limit: params.pageSize,
  });

  const categories = useEventCategories();
  // Enough clubs for the dropdown without a second endpoint. Verified only:
  // an unverified club has no published events to filter by.
  const clubs = useClubs({ isVerified: true, sort: "name", order: "asc", offset: 0, limit: 100 });

  /*
   * One clock for the whole render.
   *
   * `new Date()` per row would let a page straddle midnight and show two
   * events on the same day in different states, which is the sort of thing
   * nobody reproduces and everybody doubts.
   */
  const now = React.useMemo(() => new Date(), []);

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / params.pageSize));

  const unmarkedOnPage = rows.filter(
    (event) => rowView(event, now).present === "Not marked"
  ).length;

  const anyFilter = Boolean(
    search || clubParam || categoryParam || feeParam || period !== "all"
  );

  return (
    <div className="flex flex-col gap-[18px]">
      <header className="flex flex-wrap items-end gap-3.5">
        <div className="flex-1 basis-[300px]">
          <h2 className="m-0 text-[32px] leading-[1.12] tracking-[-0.015em]">Events</h2>
          <span className="text-[13px] text-ink-3">
            {isPending
              ? "Loading…"
              : unmarkedOnPage > 0
                ? `${formatNumber(total)} events · ${unmarkedOnPage} on this page finished without attendance`
                : `${formatNumber(total)} ${total === 1 ? "event" : "events"}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <SavedViews storageKey="events" presets={EVENT_VIEWS} />
          <ExportButton
            filename="events"
            columns={EVENT_CSV}
            fetchPage={(offset, limit) => fetchEvents({ ...filters, offset, limit })}
          />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-[280px] flex-1 basis-[220px]">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-[11px] size-4 -translate-y-1/2 text-ink-3" />
          <input
            className="input pl-8"
            type="search"
            aria-label="Search events"
            placeholder="Search events"
            value={params.searchInput}
            onChange={(event) => params.setSearchInput(event.target.value)}
            onBlur={(event) => params.commitSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") params.commitSearch(params.searchInput);
            }}
          />
        </div>

        <div
          role="group"
          aria-label="Period"
          className="inline-flex overflow-hidden rounded-[var(--radius-md)] border border-line"
        >
          {(["all", "upcoming", "ended"] as const).map((key, index) => {
            const active = period === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => params.setParam("period", key === "all" ? undefined : key)}
                className={cn(
                  "px-3 py-[7px] text-[13px] whitespace-nowrap capitalize transition-colors",
                  index > 0 && "border-l border-line",
                  active
                    ? "bg-brand-soft text-brand"
                    : "text-ink-2 hover:bg-sunken"
                )}
              >
                {key}
              </button>
            );
          })}
        </div>

        <select
          className="input w-[170px]"
          aria-label="Club"
          value={clubParam ?? ""}
          onChange={(event) => params.setParam("club", event.target.value || undefined)}
        >
          <option value="">All clubs</option>
          {(clubs.data?.items ?? []).map((club) => (
            <option key={club.id} value={String(club.id)}>
              {club.name}
            </option>
          ))}
        </select>

        <select
          className="input w-[150px]"
          aria-label="Category"
          value={categoryParam ?? ""}
          onChange={(event) => params.setParam("category", event.target.value || undefined)}
        >
          <option value="">All categories</option>
          {(categories.data ?? []).map((category) => (
            <option key={category.id} value={String(category.id)}>
              {category.name}
            </option>
          ))}
        </select>

        <select
          className="input w-[120px]"
          aria-label="Fee"
          value={feeParam ?? ""}
          onChange={(event) => params.setParam("fee", event.target.value || undefined)}
        >
          {FEE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          className="input w-[140px]"
          aria-label="Sort by"
          value={sort}
          onChange={(event) => params.setParam("sort", event.target.value)}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {isError ? (
        <InlineAlert tone="destructive" title="Could not load the list">
          {error instanceof Error ? error.message : "Try again in a moment."}
        </InlineAlert>
      ) : null}

      {!isError && (isPending || rows.length > 0) ? (
        <>
          <div className="overflow-x-auto">
            <div
              className={cn(
                "flex flex-col md:min-w-[880px]",
                isPlaceholderData && "opacity-60 transition-opacity"
              )}
            >
              <div
                className={cn(
                  GRID,
                  "micro px-1.5 py-2.5",
                  "bg-[linear-gradient(to_right,transparent,var(--line)_48px,var(--line)_calc(100%-48px),transparent)] bg-[length:100%_1px] bg-bottom bg-no-repeat"
                )}
              >
                <span>Date</span>
                <span>Event</span>
                <span className={WIDE_ONLY}>Club</span>
                <span className={WIDE_ONLY}>Category</span>
                <span className={cn(WIDE_ONLY, "text-right")}>Views</span>
                <span className={cn(WIDE_ONLY, "text-right")}>Regs</span>
                <span className={cn(WIDE_ONLY, "text-right")}>Present</span>
                <span className="text-right">Fee</span>
              </div>

              {isPending ? (
                <RowsSkeleton />
              ) : (
                rows.map((event) => {
                  const view = rowView(event, now);
                  return (
                    // The whole row opens the event (its name's link covers
                    // it), and "N under review" is a link of its own to who
                    // they are. A row that was itself an <a> couldn't hold
                    // a second link.
                    <div
                      key={event.id}
                      data-event-row
                      className={cn(
                        GRID,
                        "rule-fade relative items-center px-1.5 py-2.5 text-[13.5px]",
                        "hover:bg-sunken focus-within:bg-sunken"
                      )}
                    >
                      <span className="flex flex-col leading-[1.1]">
                        <span className="text-[10px] tracking-[0.08em] text-ink-3">
                          {view.month}
                        </span>
                        <span className="text-[17px]">{view.day}</span>
                      </span>

                      <span className="flex min-w-0 flex-col">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Link
                            href={`/events/${event.id}`}
                            className="truncate outline-none after:absolute after:inset-0 after:rounded-md after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-brand/60"
                          >
                            {event.name}
                          </Link>
                          {/* Review registrations: the club reviews every registration, and how many are under review. */}
                          {event.requires_approval ? (
                            <span className="border-line text-ink-2 shrink-0 rounded-full border px-1.5 py-px text-[10.5px] whitespace-nowrap">
                              Reviews registrations
                            </span>
                          ) : null}
                          {(event.requests_pending ?? 0) > 0 ? (
                            <Link
                              href={`/events/${event.id}#${UNDER_REVIEW_ANCHOR}`}
                              title="See who is under review"
                              className="border-caution-line text-caution relative z-10 shrink-0 rounded-full border px-1.5 py-px text-[10.5px] whitespace-nowrap tabular-nums underline-offset-2 hover:underline"
                            >
                              {formatNumber(event.requests_pending)} under review
                            </Link>
                          ) : null}
                        </span>
                        <span
                          className={cn(
                            "flex items-center gap-1.5 truncate text-[11.5px]",
                            view.stateClass
                          )}
                        >
                          {view.state}
                          {/* On a phone the club and the attendance warning
                              have nowhere else to go. */}
                          <span className="text-ink-3 md:hidden">
                            · {event.club?.name ?? "—"}
                          </span>
                          {view.present === "Not marked" ? (
                            <span className="text-brand md:hidden">
                              · Not marked
                            </span>
                          ) : null}
                        </span>
                      </span>

                      <span
                        className={cn(
                          WIDE_ONLY,
                          "truncate text-[12.5px] text-ink-2"
                        )}
                      >
                        {event.club?.name ?? "—"}
                      </span>

                      <span
                        className={cn(
                          WIDE_ONLY,
                          "truncate text-[12.5px] text-ink-2"
                        )}
                      >
                        {event.category?.name ?? "—"}
                      </span>

                      <span
                        className={cn(WIDE_ONLY, "text-right text-ink-2")}
                      >
                        {formatNumber(event.page_views ?? 0)}
                      </span>

                      <span className={cn(WIDE_ONLY, "text-right")}>
                        {formatNumber(event.registration_count)}
                        {event.requests_total !== null && (event.requires_approval || event.requests_total > 0) ? (
                          <span className="block text-[11px] text-ink-3">
                            {formatNumber(event.requests_total)} received
                          </span>
                        ) : null}
                      </span>

                      <span className={cn(WIDE_ONLY, "text-right", view.presentClass)}>
                        {view.present}
                      </span>

                      <span className="text-right text-ink-2">
                        {view.fee}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <span className="text-[12.5px] text-ink-2">
              {isPending
                ? " "
                : `Page ${params.page} of ${pages} · ${formatNumber(total)} ${total === 1 ? "event" : "events"}`}
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={params.page <= 1}
                onClick={() => params.setPage(params.page - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={params.page >= pages}
                onClick={() => params.setPage(params.page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      ) : null}

      {!isPending && !isError && rows.length === 0 ? (
        <div className="flex flex-col items-start gap-2 py-8">
          <span className="text-[16px]">
            {anyFilter ? "No events match these filters" : "No events yet"}
          </span>
          {anyFilter ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                params.clearParams(["q", "club", "category", "fee", "period", "sort"])
              }
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
