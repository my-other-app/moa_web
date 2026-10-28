"use client";

import Link from "next/link";
import { formatNumber, pct } from "@moa/app-kit";
import { Button, CardLabel, EmptyState, FigurePanel, ProgressBar, Skeleton, cn } from "@moa/ui";

import { useEventAnalytics } from "../queries";
import type { RequestDay } from "../schemas";

/**
 * The sign-ups: when in the day people registered and which colleges they
 * came from, with how many of the people who opened the page signed up.
 *
 * Read from the sign-up analytics. Turnout and money are not repeated here:
 * the door's figures come from the live summary and the money sits in the
 * headline tiles, so no number on the page is drawn twice from two sources.
 */
const SLOTS = [
  { key: "morning", label: "Morning", hint: "before noon" },
  { key: "afternoon", label: "Afternoon", hint: "12–5 pm" },
  { key: "evening", label: "Evening", hint: "5–9 pm" },
  { key: "night", label: "Night", hint: "after 9 pm" },
] as const;

const DAY_LABEL = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** "26 Oct" for a day the server named (YYYY-MM-DD, or an instant). */
function dayLabel(date: string): string {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? date : DAY_LABEL.format(d);
}

/**
 * When people asked for a place, a bar a day (the last 30 days that had
 * any), on an event that confirms each registration. Read from the
 * analytics' `requests_by_day`; its sign-ups chart counts only the people
 * already registered, which on such an event starts at nobody.
 */
function RequestsByDayPanel({ days, asked, perView }: { days: RequestDay[]; asked: number; perView: number | null }) {
  const shown = days.slice(-30);
  const busiest = Math.max(0, ...shown.map((d) => d.count));
  const peak = busiest > 0 ? shown.find((d) => d.count === busiest) : undefined;
  return (
    <FigurePanel>
      <CardLabel right={peak ? <span className="text-ink-3 font-mono text-[11px]">busiest: {dayLabel(peak.date)}</span> : null}>When people asked</CardLabel>
      {shown.length && busiest > 0 ? (
        <>
          <ul aria-label="Requests by day" className="mt-3 flex h-[96px] list-none items-end gap-1 p-0">
            {shown.map((d) => (
              <li key={d.date} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${dayLabel(d.date)}: ${formatNumber(d.count)}`}>
                <span className="sr-only">
                  {dayLabel(d.date)}: {formatNumber(d.count)} asked
                </span>
                <span
                  aria-hidden="true"
                  className={cn("block w-full rounded-t-[3px]", d.count === busiest ? "bg-brand" : "bg-brand/45")}
                  style={{ height: `${Math.max(d.count > 0 ? 6 : 2, (d.count / busiest) * 100)}%` }}
                />
              </li>
            ))}
          </ul>
          <div className="text-ink-3 mt-1 flex justify-between font-mono text-[10px]">
            <span>{dayLabel(shown[0]!.date)}</span>
            {shown.length > 1 ? <span>{dayLabel(shown[shown.length - 1]!.date)}</span> : null}
          </div>
        </>
      ) : (
        <p className="text-ink-3 mt-3 text-[12.5px]">The days people ask on show here once a few have.</p>
      )}
      <p className="text-ink-3 mt-3 text-[11.5px] leading-[1.5]">
        {formatNumber(asked)} {asked === 1 ? "person" : "people"} asked for a place
        {perView !== null ? `; ${perView}% of the people who opened the event page asked.` : "."}
      </p>
    </FigurePanel>
  );
}

export function EventInsightsPanel({ eventId, pageViews }: { eventId: number; pageViews?: number | null }) {
  const { data, isPending, isError, refetch } = useEventAnalytics(eventId);

  if (isPending) {
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-[220px] rounded-2xl" />
        <Skeleton className="h-[220px] rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <FigurePanel>
        <CardLabel className="mb-1">Sign-ups</CardLabel>
        <EmptyState
          size="sm"
          title="The sign-ups could not load"
          description="Try again in a moment."
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        />
      </FigurePanel>
    );
  }

  const total = data.total_registrations;
  // Confirm each registration: who asked, and on which days.
  const asked = data.requests_total ?? data.requests_by_day.reduce((n, d) => n + d.count, 0);
  const perView =
    pageViews && pageViews > 0 && data.requests_total !== null
      ? Math.round((100 * data.requests_total) / pageViews)
      : data.requests_per_view !== null
        ? Math.round(data.requests_per_view * 100)
        : null;
  const requestsPanel = asked > 0 ? <RequestsByDayPanel days={data.requests_by_day} asked={asked} perView={perView} /> : null;
  if (total === 0 && requestsPanel) {
    // Nobody registered yet, but people asked: they wait for the club, which is not "nobody".
    return (
      <div className="grid gap-3">
        {requestsPanel}
        <FigurePanel>
          <CardLabel className="mb-1">Sign-ups</CardLabel>
          <p className="text-ink-2 mt-2 text-[12.5px] leading-[1.55]">
            Nobody is registered yet: {formatNumber(asked)} {asked === 1 ? "person has" : "people have"} asked, and {asked === 1 ? "their ticket goes" : "their tickets go"} out as you confirm them under Requests. The hours and colleges show here once they are.
          </p>
          <Button asChild variant="secondary" size="sm" className="mt-3">
            <Link href={`/events/${eventId}/requests`}>Open requests</Link>
          </Button>
        </FigurePanel>
      </div>
    );
  }
  if (total === 0) {
    return (
      <FigurePanel>
        <CardLabel className="mb-1">Sign-ups</CardLabel>
        <EmptyState
          size="sm"
          title="Nobody has signed up yet"
          description="When they do, this shows the hours they sign up in and the colleges they come from. A tracking link for each place you share the event says which places bring people."
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href={`/events/${eventId}/links`}>Make a tracking link</Link>
            </Button>
          }
        />
      </FigurePanel>
    );
  }

  const slots = data.registration_time;
  const busiest = slots ? Math.max(slots.morning, slots.afternoon, slots.evening, slots.night) : 0;
  const peak = slots && busiest > 0 ? SLOTS.find((slot) => slots[slot.key] === busiest) : undefined;
  const conversion = Math.round(data.conversion_rate);
  const top = data.top_institutions;
  const more = Math.max(0, data.total_institutions - top.length);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {requestsPanel ? <div className="lg:col-span-2">{requestsPanel}</div> : null}
      <FigurePanel>
        <CardLabel right={peak ? <span className="text-ink-3 font-mono text-[11px]">busiest: {peak.label.toLowerCase()}</span> : null}>When people signed up</CardLabel>
        {slots && busiest > 0 ? (
          <ul className="mt-3 grid gap-2.5">
            {SLOTS.map((slot) => {
              const count = slots[slot.key];
              return (
                <li key={slot.key}>
                  <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span className={cn("text-ink", count === busiest && "font-medium")}>
                      {slot.label} <span className="text-ink-3">· {slot.hint}</span>
                    </span>
                    <span className="text-ink-3 shrink-0 font-mono text-[11px] tabular-nums">
                      {formatNumber(count)} · {pct(count, total)}%
                    </span>
                  </div>
                  <ProgressBar
                    value={count}
                    max={busiest}
                    tone={count === busiest ? "accent" : "muted"}
                    height={7}
                    className="mt-1"
                    label={`${count} registrations in the ${slot.label.toLowerCase()}`}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-ink-3 mt-3 text-[12.5px]">The hours people sign up in show here once there are a few of them.</p>
        )}
        <p className="text-ink-3 mt-3 text-[11.5px] leading-[1.5]">
          {pageViews
            ? `${formatNumber(pageViews)} ${pageViews === 1 ? "person" : "people"} opened the event page; ${conversion}% of them signed up.`
            : `${conversion}% of the people who opened the event page signed up.`}
        </p>
      </FigurePanel>

      <FigurePanel>
        <CardLabel
          right={
            data.total_institutions ? (
              <span className="text-ink-3 font-mono text-[11px]">
                {formatNumber(data.total_institutions)} {data.total_institutions === 1 ? "college" : "colleges"}
              </span>
            ) : null
          }
        >
          Where they came from
        </CardLabel>
        {top.length === 0 ? (
          <p className="text-ink-3 mt-3 text-[12.5px]">Nobody has named a college or an organisation yet.</p>
        ) : (
          <ol className="mt-3 grid gap-2.5">
            {top.map((institution, i) => (
              <li key={institution.name}>
                <div className="flex items-baseline gap-2 text-[12.5px]">
                  <span className="text-ink-3 w-4 shrink-0 font-mono text-[11px] tabular-nums">{i + 1}</span>
                  <span className={cn("text-ink min-w-0 flex-1 truncate", i === 0 && "font-medium")}>{institution.name}</span>
                  <span className="text-ink-3 shrink-0 font-mono text-[11px] tabular-nums">
                    {formatNumber(institution.value)} · {pct(institution.value, total)}%
                  </span>
                </div>
                <ProgressBar value={institution.value} max={total} height={7} className="mt-1 ml-6 w-[calc(100%-1.5rem)]" label={`${institution.name} registrations`} />
              </li>
            ))}
          </ol>
        )}
        {more > 0 ? (
          <p className="text-ink-3 mt-3 text-[11.5px]">
            And {formatNumber(more)} more {more === 1 ? "college" : "colleges"}; the guest list names each guest&apos;s.
          </p>
        ) : null}
      </FigurePanel>
    </div>
  );
}
