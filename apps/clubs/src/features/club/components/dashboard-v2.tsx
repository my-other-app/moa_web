"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckCircleIcon,
  CheckSquareIcon,
  DownloadIcon,
  EyeIcon,
  IndianRupeeIcon,
  MapPinIcon,
  MegaphoneIcon,
  ScanLineIcon,
  TicketIcon,
  UsersIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatNumber } from "@moa/app-kit";
import { InlineAlert, Skeleton, cn } from "@moa/ui";

import { fetchClubOverview } from "../api";
import {
  PERIOD_OPTIONS,
  type ClubOverview,
  type Kpi,
  type OverviewEvent,
} from "../overview-schemas";

/**
 * The club Dashboard, built to "Clubs Dashboard v2".
 *
 * Every figure comes from one `/clubs/overview` response, so nothing on the
 * page can describe a different moment from anything else on it.
 *
 * Three panels in the design are not here, and deliberately so rather than
 * filled with plausible numbers: "Attendees by ticket type" needs a ticket
 * type domain that does not exist (API_SPEC_V2 §4.3), and the "Ask about your
 * club" assistant and the widget catalogue have no endpoints at all. A panel
 * showing invented data is worse than one that is absent, because nobody can
 * tell it is invented.
 */
const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function inr(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `₹${formatNumber(Math.round(value))}`;
}

function pct(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value}%`;
}

/** The delta chip. Absent rather than zero when there is no comparison. */
function Delta({ kpi, goodWhenUp = true }: { kpi: Kpi; goodWhenUp?: boolean }) {
  if (kpi.delta === null) {
    return (
      <span className="text-[11px] text-[var(--color-neutral-500)]">
        no comparison yet
      </span>
    );
  }
  const up = kpi.delta >= 0;
  const good = goodWhenUp ? up : !up;
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-[999px] px-2 py-0.5 text-[12px] whitespace-nowrap",
        good
          ? "bg-[var(--color-accent-900)] text-[var(--color-accent-200)]"
          : "bg-[var(--color-neutral-800)] text-[var(--color-neutral-200)]"
      )}
    >
      {up ? "▲" : "▼"} {Math.abs(kpi.delta)}%
    </span>
  );
}

function KpiCard({
  label,
  icon,
  kpi,
  format,
}: {
  label: string;
  icon: React.ReactNode;
  kpi: Kpi;
  format: (value: number | null) => string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-col gap-1 rounded-[var(--radius-lg)] bg-[var(--color-surface)] px-5 py-[18px] shadow-[var(--shadow-sm)]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13.5px] text-[var(--color-neutral-200)]">{label}</span>
        <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-[var(--color-accent-900)] text-[var(--color-accent-300)]">
          {icon}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[24px] tracking-[-0.02em]">{format(kpi.value)}</span>
        <Delta kpi={kpi} />
      </div>
      <span className="text-[11px] text-[var(--color-neutral-500)]">
        vs. {format(kpi.previous)} last period
      </span>
    </div>
  );
}

/**
 * Two polylines over a filled area, in a 400x140 viewBox and stretched.
 *
 * Hand-rolled rather than a chart library: the design wants a solid current
 * line, a dashed previous one and a tinted fill, and nothing else -- no axes,
 * grid, tooltip or legend. Pulling in recharts to then hide all of it costs
 * more than the geometry does.
 */
function RevenueChart({ series }: { series: ClubOverview["revenue_series"] }) {
  const current = series.current;
  const previous = series.previous;
  const max = Math.max(
    1,
    ...current.map((p) => p.revenue),
    ...previous.map((p) => p.revenue)
  );

  const points = (data: typeof current) =>
    data
      .map((point, i) => {
        const x = data.length > 1 ? (i / (data.length - 1)) * 400 : 0;
        const y = 140 - (point.revenue / max) * 130;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  const line = points(current);
  const area = current.length ? `0,140 ${line} 400,140` : "";

  return (
    <svg
      viewBox="0 0 400 140"
      preserveAspectRatio="none"
      className="h-[140px] w-full"
      role="img"
      aria-label="Captured ticket revenue over the period"
    >
      {area ? <polygon points={area} fill="var(--color-accent-900)" /> : null}
      {previous.length > 1 ? (
        <polyline
          points={points(previous)}
          fill="none"
          stroke="var(--color-neutral-600)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {current.length > 1 ? (
        <polyline
          points={line}
          fill="none"
          stroke="var(--color-accent-400)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}

function Panel({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--color-surface)] p-[18px] shadow-[var(--shadow-sm)]",
        className
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[15px]">{title}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

/**
 * A clock that ticks once a second.
 *
 * Lifted out of the countdown so the same `now` decides both the digits and
 * whether the event has started -- reading `Date.now()` during render would
 * only re-evaluate when something else re-rendered the parent, so "doors
 * open" would appear whenever the page happened to update rather than when
 * the event actually began.
 */
function useNow(active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!active) return;
    // One second is the point of a countdown; anything slower reads as broken.
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  return now;
}

/** Hours/minutes/seconds remaining, from an already-ticking clock. */
function Countdown({ target, now }: { target: number; now: number }) {
  if (Number.isNaN(target)) return null;

  const remaining = Math.max(0, target - now);
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[12px] text-[var(--color-neutral-400)]">Starts in</span>
      <span className="font-mono text-[20px] text-[var(--color-accent-200)] tabular-nums">
        {pad(hours)}
      </span>
      <span className="text-[12px] text-[var(--color-neutral-500)]">h</span>
      <span className="font-mono text-[20px] text-[var(--color-accent-200)] tabular-nums">
        {pad(minutes)}
      </span>
      <span className="text-[12px] text-[var(--color-neutral-500)]">m</span>
      <span className="font-mono text-[20px] text-[var(--color-accent-200)] tabular-nums">
        {pad(seconds)}
      </span>
      <span className="text-[12px] text-[var(--color-neutral-500)]">s</span>
    </div>
  );
}

function NextEvent({ event }: { event: OverviewEvent }) {
  const when = event.event_datetime ? new Date(event.event_datetime) : null;
  const target = when ? when.getTime() : NaN;
  const now = useNow(!Number.isNaN(target));
  const live = !Number.isNaN(target) && target <= now;

  return (
    <section className="relative flex flex-col gap-4 overflow-hidden rounded-[var(--radius-lg)] bg-[radial-gradient(90%_140%_at_0%_0%,var(--color-section-glow),var(--color-section)_60%)] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tag tag-accent">
          {live ? "Doors open · check-in live" : "Next event"}
        </span>
        {!live ? <Countdown target={target} now={now} /> : null}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-[22px] leading-[1.15] tracking-[-0.02em] text-[var(--color-neutral-100)]">
          {event.name}
        </h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[var(--color-neutral-200)]">
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
            {event.has_fee && event.reg_fee ? `${inr(event.reg_fee)} entry` : "Free"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={`/events/${event.id}`} className="btn btn-primary whitespace-nowrap">
          <ArrowRightIcon className="size-4" />
          Manage event
        </Link>
        <Link
          href={`/events/${event.id}#check-in`}
          className="btn btn-secondary whitespace-nowrap"
        >
          <ScanLineIcon className="size-4" />
          Door check-in
        </Link>
        <Link href="/announcements" className="btn btn-ghost whitespace-nowrap">
          <MegaphoneIcon className="size-4" />
          Announce
        </Link>
      </div>

      <div className="flex flex-col gap-2 rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--color-neutral-900)_45%,transparent)] p-3.5">
        <div className="grid grid-cols-3 gap-2">
          {[
            ["Page views", formatNumber(event.page_views)],
            ["Registrations", formatNumber(event.registrations)],
            ["Checked in", formatNumber(event.attended)],
          ].map(([label, value]) => (
            <span key={label} className="flex flex-col">
              <span className="text-[11px] text-[var(--color-neutral-300)]">{label}</span>
              <span className="text-[17px] text-[var(--color-neutral-100)]">{value}</span>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[var(--color-neutral-300)]">
          <span>
            <span className="text-[var(--color-accent-200)]">
              {pct(event.view_to_signup)}
            </span>{" "}
            of viewers signed up
          </span>
          <span>
            <span className="text-[var(--color-accent-200)]">{pct(event.turnout)}</span>{" "}
            of sign-ups here so far
          </span>
        </div>
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[112px] rounded-[var(--radius-lg)]" />
        ))}
      </div>
      <div className="grid gap-3.5 lg:grid-cols-[1.4fr_1fr]">
        <Skeleton className="h-[280px] rounded-[var(--radius-lg)]" />
        <Skeleton className="h-[280px] rounded-[var(--radius-lg)]" />
      </div>
    </div>
  );
}

export function ClubDashboardV2() {
  const [days, setDays] = React.useState(30);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["club-overview", days],
    queryFn: () => fetchClubOverview(days),
  });

  if (isError) {
    return (
      <InlineAlert tone="destructive" title="Could not load your dashboard">
        {error instanceof Error ? error.message : "Try again in a moment."}
      </InlineAlert>
    );
  }

  if (isPending || !data) return <DashboardSkeleton />;

  const next = data.next_event;
  const busiestMax = Math.max(1, ...data.busiest_day.map((d) => d.value));
  const followerMax = Math.max(1, ...data.followers.series.map((f) => f.value));
  const bestUpcoming = Math.max(1, ...data.upcoming.map((e) => e.registrations));

  const today = new Date();
  const subtitle = next
    ? `${today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })} · ${next.name}`
    : today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });

  return (
    <div className="flex flex-col gap-[18px]">
      <header className="flex flex-wrap items-end gap-3.5">
        <div className="flex-1 basis-[300px]">
          <h2 className="m-0 text-[32px] leading-[1.12] tracking-[-0.015em]">Dashboard</h2>
          <span className="text-[13px] text-[var(--color-neutral-500)]">{subtitle}</span>
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
            className="btn btn-secondary whitespace-nowrap"
            href={`/api/gateway/api/v1/clubs/overview?days=${days}`}
            download={`club-overview-${days}d.json`}
          >
            <DownloadIcon className="size-4" />
            Export
          </a>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Registrations"
          icon={<TicketIcon className="size-4" />}
          kpi={data.kpis.registrations}
          format={(v) => formatNumber(v ?? 0)}
        />
        <KpiCard
          label="Page views"
          icon={<EyeIcon className="size-4" />}
          kpi={data.kpis.page_views}
          format={(v) => formatNumber(v ?? 0)}
        />
        <KpiCard
          label="Captured revenue"
          icon={<IndianRupeeIcon className="size-4" />}
          kpi={data.kpis.revenue}
          format={inr}
        />
        <KpiCard
          label="Turnout"
          icon={<CheckCircleIcon className="size-4" />}
          kpi={data.kpis.attendance_rate}
          format={pct}
        />
      </section>

      <div className="grid gap-3.5 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex min-w-0 flex-col gap-3.5">
          <Panel
            title="Ticket revenue"
            aside={
              <span className="text-[12px] text-[var(--color-neutral-500)]">
                money actually captured
              </span>
            }
          >
            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="text-[24px] tracking-[-0.02em]">
                {inr(data.kpis.revenue.value)}
              </span>
              <Delta kpi={data.kpis.revenue} />
            </div>
            <RevenueChart series={data.revenue_series} />
            <div className="flex justify-between text-[11px] text-[var(--color-neutral-500)]">
              <span>
                {data.revenue_series.current[0]?.date.slice(5).replace("-", "/") ?? ""}
              </span>
              <span>
                {data.revenue_series.current.at(-1)?.date.slice(5).replace("-", "/") ?? ""}
              </span>
            </div>
          </Panel>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Panel title="Busiest sign-up day">
              <div className="flex h-[110px] items-end gap-1.5">
                {data.busiest_day.map((day) => (
                  <div
                    key={day.label}
                    className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                  >
                    <span className="text-[10.5px] text-[var(--color-neutral-300)]">
                      {day.value}
                    </span>
                    <div
                      className="w-full rounded-t-[4px] bg-[var(--color-accent-600)]"
                      style={{ height: `${Math.max(2, (day.value / busiestMax) * 80)}px` }}
                    />
                    <span className="text-[10.5px] text-[var(--color-neutral-500)]">
                      {day.label}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Repeat attendees">
              <div className="flex flex-1 flex-col justify-center gap-1">
                <span className="text-[28px] tracking-[-0.02em] text-[var(--color-accent-200)]">
                  {pct(data.repeat_rate)}
                </span>
                <span className="text-[12px] text-pretty text-[var(--color-neutral-400)]">
                  {data.repeat_rate === null
                    ? "Nobody has attended an event yet, so there is nothing to repeat."
                    : "of the people who have attended came to more than one event."}
                </span>
              </div>
              <Link href="/followers" className="btn btn-secondary self-start">
                See regulars
              </Link>
            </Panel>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3.5">
          {next ? (
            <NextEvent event={next} />
          ) : (
            <Panel title="Next event">
              <span className="text-[13px] text-[var(--color-neutral-400)]">
                Nothing scheduled. Create an event and it will appear here with its
                sign-ups and a live countdown.
              </span>
              <Link href="/events/new" className="btn btn-primary self-start">
                Create an event
              </Link>
            </Panel>
          )}

          <Panel
            title="New followers"
            aside={
              <span className="text-[12px] text-[var(--color-neutral-500)]">
                {formatNumber(data.followers.total)} total
              </span>
            }
          >
            <div className="flex h-[70px] items-end gap-1">
              {data.followers.series.length === 0 ? (
                <span className="text-[13px] text-[var(--color-neutral-500)]">
                  No new followers in the last 12 weeks.
                </span>
              ) : (
                data.followers.series.map((week, index) => (
                  <div
                    // Position is identity for a bar in a fixed-length
                    // sparkline, and it is the only key that cannot collide:
                    // two buckets sharing a date would silently drop a bar.
                    key={index}
                    title={`${week.value} in the week of ${week.week}`}
                    className="flex-1 rounded-t-[3px] bg-[var(--color-accent-700)]"
                    style={{ height: `${Math.max(3, (week.value / followerMax) * 70)}px` }}
                  />
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Panel
          title="Coming up"
          aside={
            data.upcoming.length > 1 ? (
              <span className="text-[12px] text-[var(--color-neutral-500)]">
                bars compare against your best upcoming
              </span>
            ) : undefined
          }
        >
          {data.upcoming.length === 0 ? (
            <span className="text-[13px] text-[var(--color-neutral-500)]">
              Nothing scheduled.
            </span>
          ) : (
            data.upcoming.map((event) => {
              const when = event.event_datetime ? new Date(event.event_datetime) : null;
              return (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="rule-fade flex items-center gap-3 py-2.5"
                >
                  <span className="flex w-10 shrink-0 flex-col leading-[1.1]">
                    <span className="text-[10px] tracking-[0.08em] text-[var(--color-neutral-500)]">
                      {when ? MONTHS[when.getMonth()] : "—"}
                    </span>
                    <span className="text-[17px]">{when ? when.getDate() : ""}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-[13.5px]">{event.name}</span>
                    <span className="h-1.5 rounded-[3px] bg-[var(--color-neutral-900)]">
                      <span
                        className="block h-full rounded-[3px] bg-[var(--color-accent-500)]"
                        style={{
                          width: `${Math.min(100, (event.registrations / bestUpcoming) * 100)}%`,
                        }}
                      />
                    </span>
                  </span>
                  <span className="shrink-0 text-[13.5px] tabular-nums">
                    {formatNumber(event.registrations)}
                  </span>
                </Link>
              );
            })
          )}
        </Panel>

        <Panel
          title="Needs attention"
          aside={
            data.needs_attention_total > 0 ? (
              <span className="tag tag-accent">{data.needs_attention_total}</span>
            ) : undefined
          }
        >
          {data.needs_attention.length === 0 ? (
            <span className="flex items-center gap-2 text-[13px] text-[var(--color-neutral-400)]">
              <CheckCircleIcon className="size-4 text-[var(--color-accent-300)]" />
              All caught up — every finished event has attendance.
            </span>
          ) : (
            <>
              <p className="m-0 text-[12.5px] text-pretty text-[var(--color-neutral-400)]">
                Finished, but nobody was marked present — so no certificates or winners
                can be issued.
              </p>
              {data.needs_attention.map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="flex flex-col gap-1 rounded-[var(--radius-md)] bg-[var(--color-bg)] p-3"
                >
                  <span className="truncate text-[13.5px]">{event.name}</span>
                  <span className="flex items-center gap-1.5 text-[12px] text-[var(--color-accent-300)]">
                    <CheckSquareIcon className="size-3.5" />
                    {formatNumber(event.registrations)} registered · 0 present
                  </span>
                </Link>
              ))}
            </>
          )}
        </Panel>
      </div>

      <Panel
        title="Reach"
        aside={
          <span className="text-[12px] text-[var(--color-neutral-500)]">
            unseen or unappealing? views tell the two apart
          </span>
        }
      >
        {data.reach.length === 0 ? (
          <span className="text-[13px] text-[var(--color-neutral-500)]">
            No finished events yet.
          </span>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="micro rule-fade grid grid-cols-[minmax(0,1.6fr)_80px_80px_110px_90px] gap-2 py-2">
                <span>Past event</span>
                <span className="text-right">Views</span>
                <span className="text-right">Sign-ups</span>
                <span className="text-right">View → sign-up</span>
                <span className="text-right">Turnout</span>
              </div>
              {data.reach.map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="rule-fade grid grid-cols-[minmax(0,1.6fr)_80px_80px_110px_90px] items-center gap-2 py-2.5 text-[13px]"
                >
                  <span className="truncate">{event.name}</span>
                  <span className="text-right text-[var(--color-neutral-300)]">
                    {formatNumber(event.page_views)}
                  </span>
                  <span className="text-right">{formatNumber(event.registrations)}</span>
                  <span className="text-right text-[var(--color-neutral-300)]">
                    {pct(event.view_to_signup)}
                  </span>
                  <span
                    className={cn(
                      "text-right",
                      event.turnout === null && "text-[var(--color-neutral-600)]"
                    )}
                  >
                    {pct(event.turnout)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
