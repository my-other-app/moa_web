"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  CalendarIcon,
  DownloadIcon,
  IndianRupeeIcon,
  MapPinIcon,
  UsersIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  AttentionCard,
  DoorsOpenCard,
  attentionPath,
  formatNumber,
  type AttentionItem,
} from "@moa/app-kit";
import {
  CardLabel,
  FigurePanel,
  InlineAlert,
  ProgressBar,
  Skeleton,
  StatTile,
  cn,
} from "@moa/ui";

import { fetchClubOverview } from "../api";
import { useClubDashboard, useMyClub } from "../queries";
import {
  PERIOD_OPTIONS,
  type ClubOverview,
  type Kpi,
  type OverviewEvent,
} from "../overview-schemas";

/**
 * The club's home page, in four rows.
 *
 * A greeting and one sentence on where things stand; four figures for the
 * period; what needs a decision beside what is happening now (the doors
 * open, or the next event when none is); the money and the calendar; the
 * audience and the reach. Eight panels in one vocabulary, instead of the
 * fifteen in two it replaced. Every figure comes from one of two responses
 * — the period overview and the live pulse — so nothing on the page can
 * describe a different moment from the panel beside it.
 */
const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

function inr(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `₹${formatNumber(Math.round(value))}`;
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function deltaOf(
  kpi: Kpi,
  unit = "%",
): { delta?: string; trend: "none" | "up" | "down" } {
  if (kpi.delta === null) return { trend: "none" };
  return {
    delta: `${kpi.delta > 0 ? "+" : kpi.delta < 0 ? "−" : ""}${Math.abs(kpi.delta)}${unit}`,
    trend: kpi.delta > 0 ? "up" : kpi.delta < 0 ? "down" : "none",
  };
}

/** A clock that ticks once a second, lifted so the digits and "has it started" agree. */
function useNow(active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function Countdown({ target, now }: { target: number; now: number }) {
  const remaining = Math.max(0, target - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="font-mono text-[22px] leading-none tracking-[-0.02em] tabular-nums">
      {days > 0 ? `${days}d ` : ""}
      {pad(hours)}:{pad(minutes)}:{pad(seconds)}
    </span>
  );
}

/** The next event as the one highlight, when no door is open. */
function NextEventCard({ event }: { event: OverviewEvent | null }) {
  const when = event?.event_datetime ? new Date(event.event_datetime) : null;
  const target = when ? when.getTime() : NaN;
  const now = useNow(!Number.isNaN(target));
  if (!event) {
    return (
      <FigurePanel className="flex flex-col">
        <CardLabel className="mb-3">Next event</CardLabel>
        <p className="text-ink-2 text-[12.5px] leading-[1.55]">
          Nothing scheduled. Create an event and it appears here with its
          sign-ups and a countdown.
        </p>
        <Link href="/events/new" className="btn btn-primary mt-4 self-start">
          Create an event
        </Link>
      </FigurePanel>
    );
  }
  const started = !Number.isNaN(target) && target <= now;
  return (
    <div className="shadow-hero relative flex flex-col gap-3 overflow-hidden rounded-2xl bg-[linear-gradient(150deg,var(--hero-from)_0%,var(--hero-to)_100%)] p-4 text-white">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(130%_100%_at_88%_4%,rgba(255,255,255,0.2)_0%,transparent_58%)]"
      />
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-medium tracking-[0.09em] text-white/75 uppercase">
          {started ? "Doors open · next event" : "Next event"}
        </span>
        {!started && !Number.isNaN(target) ? (
          <Countdown target={target} now={now} />
        ) : null}
      </div>
      <div className="relative">
        <Link
          href={`/events/${event.id}`}
          className="block text-[20px] leading-[1.2] font-semibold tracking-[-0.02em] hover:underline"
        >
          {event.name}
        </Link>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-white/80">
          {when ? (
            <span className="flex items-center gap-1.5">
              <CalendarIcon className="size-3.5" />
              {when.toLocaleString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          ) : null}
          {event.location_name ? (
            <span className="flex items-center gap-1.5">
              <MapPinIcon className="size-3.5" />
              {event.location_name}
            </span>
          ) : null}
          <span className="flex items-center gap-1.5">
            <IndianRupeeIcon className="size-3.5" />
            {event.has_fee && event.reg_fee
              ? `${inr(event.reg_fee)} entry`
              : "Free"}
          </span>
        </div>
      </div>
      <div className="relative grid grid-cols-3 gap-2 rounded-xl bg-black/20 p-3">
        {[
          ["Page views", formatNumber(event.page_views)],
          ["Registrations", formatNumber(event.registrations)],
          [
            "View → sign-up",
            event.view_to_signup === null ? "—" : `${event.view_to_signup}%`,
          ],
        ].map(([label, value]) => (
          <span key={label} className="flex min-w-0 flex-col">
            <span className="truncate font-mono text-[9.5px] tracking-[0.06em] text-white/70 uppercase">
              {label}
            </span>
            <span className="font-mono text-[17px] tabular-nums">{value}</span>
          </span>
        ))}
      </div>
      <div className="relative flex flex-wrap gap-2">
        <Link
          href={`/events/${event.id}`}
          className="btn btn-sm btn-round border-transparent bg-white/95 font-semibold text-[var(--hero-to)] hover:bg-white"
        >
          Manage event
        </Link>
        <Link
          href={`/events/${event.id}/attendees`}
          className="btn btn-sm btn-round border-transparent bg-white/15 text-white hover:bg-white/25"
        >
          Guest list
        </Link>
      </div>
    </div>
  );
}

/** Two lines over a filled area: this period solid, the previous one dashed. */
function RevenueChart({ series }: { series: ClubOverview["revenue_series"] }) {
  const current = series.current;
  const previous = series.previous;
  const max = Math.max(
    1,
    ...current.map((p) => p.revenue),
    ...previous.map((p) => p.revenue),
  );
  const points = (data: typeof current) =>
    data
      .map(
        (point, i) =>
          `${(data.length > 1 ? (i / (data.length - 1)) * 400 : 0).toFixed(1)},${(140 - (point.revenue / max) * 130).toFixed(1)}`,
      )
      .join(" ");
  const line = points(current);
  return (
    <svg
      viewBox="0 0 400 140"
      preserveAspectRatio="none"
      className="h-[130px] w-full"
      role="img"
      aria-label="Captured ticket revenue over the period, against the previous one"
    >
      {current.length ? (
        <polygon
          points={`0,140 ${line} 400,140`}
          fill="color-mix(in srgb, var(--brand) 14%, transparent)"
        />
      ) : null}
      {previous.length > 1 ? (
        <polyline
          points={points(previous)}
          fill="none"
          stroke="var(--ink-3)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {current.length > 1 ? (
        <polyline
          points={line}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}

function RevenuePanel({ o, days }: { o: ClubOverview; days: number }) {
  const d = deltaOf(o.kpis.revenue);
  const first = o.revenue_series.current[0]?.date;
  const last = o.revenue_series.current.at(-1)?.date;
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });
  return (
    <FigurePanel>
      <CardLabel
        className="mb-3"
        right={
          <span className="text-ink-3 text-[11px]">
            money captured, last {days} days
          </span>
        }
      >
        Ticket revenue
      </CardLabel>
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="font-mono text-[28px] leading-none tracking-[-0.02em] tabular-nums">
          {inr(o.kpis.revenue.value)}
        </span>
        {d.delta ? (
          <span
            className={cn(
              "rounded-full px-1.5 py-1 font-mono text-[10px] font-medium leading-none",
              d.trend === "down"
                ? "bg-caution-soft text-caution"
                : "bg-admit-soft text-admit",
            )}
          >
            {d.trend === "up" ? "▲ " : d.trend === "down" ? "▼ " : ""}
            {d.delta}
          </span>
        ) : (
          <span className="text-ink-3 text-[11px]">no comparison yet</span>
        )}
      </div>
      <div className="mt-3">
        <RevenueChart series={o.revenue_series} />
      </div>
      <div className="text-ink-3 mt-1.5 flex justify-between font-mono text-[10px] tracking-[0.04em] uppercase">
        <span>{first ? day(first) : ""}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="bg-brand inline-block h-[2px] w-3 rounded-full"
            />{" "}
            this period
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="bg-ink-3 inline-block h-[2px] w-3 rounded-full opacity-70"
            />{" "}
            previous
          </span>
        </span>
        <span>{last ? day(last) : ""}</span>
      </div>
    </FigurePanel>
  );
}

function ComingUp({ events }: { events: OverviewEvent[] }) {
  const best = Math.max(1, ...events.map((e) => e.registrations));
  return (
    <FigurePanel className="flex flex-col p-0">
      <div className="border-line-soft flex items-center justify-between border-b px-4 py-3">
        <CardLabel>Coming up</CardLabel>
        <Link
          href="/events"
          className="text-brand hover:text-ink text-[12px] font-medium"
        >
          All events →
        </Link>
      </div>
      {events.length === 0 ? (
        <p className="text-ink-2 px-4 py-7 text-center text-[12.5px]">
          Nothing scheduled.
        </p>
      ) : null}
      {events.map((event) => {
        const when = event.event_datetime
          ? new Date(event.event_datetime)
          : null;
        return (
          <Link
            key={event.id}
            href={`/events/${event.id}`}
            className="border-line-soft hover:bg-sunken flex items-center gap-3 border-t px-4 py-2.5 transition-colors first:border-t-0"
          >
            <span className="bg-sunken flex w-11 shrink-0 flex-col items-center rounded-lg py-1 leading-[1.1]">
              <span className="text-ink-3 font-mono text-[9px] tracking-[0.08em]">
                {when ? MONTHS[when.getMonth()] : "—"}
              </span>
              <span className="font-mono text-[16px] tabular-nums">
                {when ? when.getDate() : ""}
              </span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="truncate text-[13px] font-medium">
                {event.name}
              </span>
              <ProgressBar
                value={event.registrations}
                max={best}
                height={5}
                label={`${event.name} registrations`}
              />
            </span>
            <span className="text-ink-2 shrink-0 font-mono text-[12px] tabular-nums">
              {formatNumber(event.registrations)}
            </span>
          </Link>
        );
      })}
      {events.length > 1 ? (
        <p className="text-ink-3 border-line-soft border-t px-4 py-2.5 text-[11px]">
          Bars compare against your best upcoming event.
        </p>
      ) : null}
    </FigurePanel>
  );
}

function AudiencePanel({ o }: { o: ClubOverview }) {
  const followerMax = Math.max(1, ...o.followers.series.map((f) => f.value));
  const busiestMax = Math.max(1, ...o.busiest_day.map((d) => d.value));
  const top = o.busiest_day.reduce<{ label: string; value: number } | null>(
    (m, d) => (m === null || d.value > m.value ? d : m),
    null,
  );
  return (
    <FigurePanel>
      <CardLabel className="mb-3">Audience</CardLabel>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="min-w-0">
          <div className="eyebrow">Followers</div>
          <div className="mt-1 font-mono text-[22px] leading-none tabular-nums">
            {formatNumber(o.followers.total)}
          </div>
          <div
            className="mt-2 flex h-9 items-end gap-[3px]"
            aria-label="New followers per week, last twelve weeks"
          >
            {o.followers.series.length === 0 ? (
              <span className="text-ink-3 text-[11px]">
                none new in 12 weeks
              </span>
            ) : (
              o.followers.series.map((week, index) => (
                <span
                  key={index}
                  title={`${week.value} in the week of ${week.week}`}
                  className="bg-brand/70 flex-1 rounded-t-[2px]"
                  style={{
                    height: `${Math.max(8, (week.value / followerMax) * 100)}%`,
                  }}
                />
              ))
            )}
          </div>
          <div className="text-ink-3 mt-1 text-[11px]">
            new per week, 12 weeks
          </div>
        </div>
        <div className="min-w-0">
          <div className="eyebrow">Repeat attendees</div>
          <div className="text-admit mt-1 font-mono text-[22px] leading-none tabular-nums">
            {o.repeat_rate === null ? "—" : `${o.repeat_rate}%`}
          </div>
          <p className="text-ink-3 mt-2 text-[11px] leading-[1.5]">
            {o.repeat_rate === null
              ? "Nobody has attended an event yet."
              : "of everyone who has attended came to more than one event."}
          </p>
          <Link
            href="/followers"
            className="text-brand hover:text-ink mt-1.5 inline-block text-[11.5px] font-medium"
          >
            See regulars →
          </Link>
        </div>
        <div className="min-w-0">
          <div className="eyebrow">Busiest sign-up day</div>
          <div className="mt-1 font-mono text-[22px] leading-none tabular-nums">
            {top ? top.label : "—"}
          </div>
          <div
            className="mt-2 flex h-9 items-end gap-[3px]"
            aria-label="Sign-ups by weekday"
          >
            {o.busiest_day.map((d) => (
              <span
                key={d.label}
                title={`${d.value} on ${d.label}`}
                className={cn(
                  "flex-1 rounded-t-[2px]",
                  d.label === top?.label ? "bg-brand" : "bg-raised",
                )}
                style={{
                  height: `${Math.max(8, (d.value / busiestMax) * 100)}%`,
                }}
              />
            ))}
          </div>
          <div className="text-ink-3 mt-1 flex justify-between font-mono text-[9px] tracking-[0.04em]">
            <span>MON</span>
            <span>SUN</span>
          </div>
        </div>
      </div>
    </FigurePanel>
  );
}

function ReachPanel({ rows }: { rows: OverviewEvent[] }) {
  return (
    <FigurePanel className="p-0">
      <div className="border-line-soft flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <CardLabel>Reach</CardLabel>
        <span className="text-ink-3 text-[11px]">
          past events · views tell unseen from unappealing
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-ink-2 px-4 py-7 text-center text-[12.5px]">
          No finished events yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[520px]">
            <div className="text-ink-3 grid grid-cols-[minmax(0,1.6fr)_70px_70px_100px_80px] gap-2 px-4 py-2 font-mono text-[10px] tracking-[0.06em] uppercase">
              <span>Event</span>
              <span className="text-right">Views</span>
              <span className="text-right">Sign-ups</span>
              <span className="text-right">View → sign-up</span>
              <span className="text-right">Turnout</span>
            </div>
            {rows.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="border-line-soft hover:bg-sunken grid grid-cols-[minmax(0,1.6fr)_70px_70px_100px_80px] items-center gap-2 border-t px-4 py-2.5 text-[12.5px] transition-colors"
              >
                <span className="truncate font-medium">{event.name}</span>
                <span className="text-ink-2 text-right font-mono tabular-nums">
                  {formatNumber(event.page_views)}
                </span>
                <span className="text-right font-mono tabular-nums">
                  {formatNumber(event.registrations)}
                </span>
                <span className="text-ink-2 text-right font-mono tabular-nums">
                  {event.view_to_signup === null
                    ? "—"
                    : `${event.view_to_signup}%`}
                </span>
                <span
                  className={cn(
                    "text-right font-mono tabular-nums",
                    event.turnout === null
                      ? "text-ink-3"
                      : event.turnout < 50
                        ? "text-caution"
                        : "text-admit",
                  )}
                >
                  {event.turnout === null ? "—" : `${event.turnout}%`}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </FigurePanel>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <Skeleton className="h-12 w-72 rounded-xl" />
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[126px] rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Skeleton className="h-[260px] rounded-2xl" />
        <Skeleton className="h-[260px] rounded-2xl" />
      </div>
    </div>
  );
}

export function ClubDashboardV2() {
  const [days, setDays] = React.useState(30);
  const overview = useQuery({
    queryKey: ["club-overview", days],
    queryFn: () => fetchClubOverview(days),
  });
  const pulse = useClubDashboard();
  const club = useMyClub();

  if (overview.isError) {
    return (
      <InlineAlert tone="destructive" title="Could not load your dashboard">
        {overview.error instanceof Error
          ? overview.error.message
          : "Try again in a moment."}
      </InlineAlert>
    );
  }
  const o = overview.data;
  if (!o) return <DashboardSkeleton />;
  const d = pulse.data;
  const live = d?.live ?? [];

  // One list of decisions: the pulse's, then the finished events nobody marked attendance for.
  const attention: AttentionItem[] = [
    ...(d?.attention ?? []),
    ...o.needs_attention.map((e) => ({
      kind: "NO_ATTENDANCE",
      tone: "amber" as const,
      title: `${e.name} finished with nobody marked present`,
      body: `${formatNumber(e.registrations)} registered. Certificates and winners wait on attendance; mark it from the guest list.`,
      event_id: e.id,
    })),
  ].slice(0, 6);
  const hrefFor = (item: AttentionItem) =>
    item.kind === "NO_ATTENDANCE" && item.event_id !== null
      ? `/events/${item.event_id}/attendees`
      : attentionPath(item);

  const doors =
    live.length === 0
      ? "No doors are"
      : live.length === 1
        ? "One door is"
        : `${live.length} doors are`;
  const decisions =
    attention.length === 0
      ? "Nothing needs a decision."
      : attention.length === 1
        ? "One thing needs a decision."
        : `${attention.length} things need a decision.`;
  const regs = deltaOf(o.kpis.registrations);
  const rev = deltaOf(o.kpis.revenue);
  const turn = deltaOf(o.kpis.attendance_rate, " pts");

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3.5">
        <div className="min-w-0">
          <h1 className="page-title">
            {greeting()}
            {club.data?.name ? `, ${club.data.name}` : ""}
          </h1>
          <p className="text-ink-2 mt-1 max-w-[62ch] text-[13.5px]">
            {doors} open right now. {decisions}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input w-[150px]"
            aria-label="Period"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <a
            className="btn btn-secondary"
            href={`/api/gateway/api/v1/clubs/overview?days=${days}`}
            download={`club-overview-${days}d.json`}
          >
            <DownloadIcon className="size-4" />
            Export
          </a>
        </div>
      </header>

      <section className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Registrations"
          value={formatNumber(o.kpis.registrations.value ?? 0)}
          delta={regs.delta}
          trend={regs.trend}
          note={`in the last ${days} days`}
        />
        <StatTile
          label="Revenue captured"
          value={inr(o.kpis.revenue.value)}
          delta={rev.delta}
          trend={rev.trend}
          note={rev.delta ? `vs the ${days} days before` : "no comparison yet"}
        />
        <StatTile
          label="Turnout"
          value={
            o.kpis.attendance_rate.value === null
              ? "—"
              : `${Math.round(o.kpis.attendance_rate.value)}%`
          }
          delta={turn.delta}
          trend={turn.trend}
          note="of sign-ups came through the door"
        />
        <StatTile
          linkAs={Link}
          label="Events"
          value={d ? d.stats.events.total : "—"}
          note={
            d
              ? `${d.stats.events.live} live · ${d.stats.events.draft} draft · ${d.stats.events.closed} closed · ${formatNumber(d.stats.on_file)} on file`
              : "loading"
          }
          action={{ label: "Open events", href: "/events" }}
        />
      </section>

      <section className="grid gap-3.5 lg:grid-cols-2">
        <AttentionCard
          items={attention}
          hrefFor={hrefFor}
          allClear="Nothing is waiting on you. Every finished event has its attendance marked and every open one has its tickets out."
        />
        {live.length ? (
          <DoorsOpenCard
            live={live}
            eventHref={(l) => `/events/${l.event_id}`}
            gateHref={(l) => `/gate/${l.event_id}`}
            refreshing={pulse.isFetching}
            emptyBody=""
          />
        ) : (
          <NextEventCard event={o.next_event} />
        )}
      </section>

      <section className="grid gap-3.5 lg:grid-cols-[1.4fr_1fr]">
        <RevenuePanel o={o} days={days} />
        <ComingUp events={o.upcoming} />
      </section>

      <section className="grid gap-3.5 lg:grid-cols-[1fr_1.4fr]">
        <AudiencePanel o={o} />
        <ReachPanel rows={o.reach} />
      </section>

      {d && d.stats.retention_due > 0 ? (
        <p className="text-ink-3 flex items-center gap-1.5 text-[12px]">
          <UsersIcon className="size-3.5" />
          {d.stats.retention_due === 1
            ? "One event's guest data is due for deletion this week"
            : `${d.stats.retention_due} events' guest data are due for deletion this week`}
          {" · "}
          <Link
            href="/events?scope=past"
            className="text-brand hover:text-ink inline-flex items-center gap-1 font-medium"
          >
            past events <ArrowRightIcon className="size-3" />
          </Link>
        </p>
      ) : null}
    </div>
  );
}
