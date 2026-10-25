"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  CalendarCheckIcon,
  CopyIcon,
  FileDownIcon,
  IndianRupeeIcon,
  PresentationIcon,
  TicketIcon,
  UserPlusIcon,
  WrenchIcon,
} from "lucide-react";
import { formatCurrency, formatNumber } from "@moa/app-kit";
import { Button, Skeleton, cn, toast } from "@moa/ui";

import { useAdminOverview } from "../queries";
import { approx, estimatedTotals, type AdminOverview, type TopClubSort } from "../overview-schemas";
import { changeOf } from "../delta";
import { Meter, Micro, Panel, PanelTitle, RuleRow, Segmented } from "./v2-primitives";
import { RevenueStrip } from "@/features/revenue";

import { PlatformDoorsPanel } from "./platform-doors-panel";

/**
 * The v2 Overview.
 *
 * Every figure comes from one `/admin/overview` response, so nothing on the
 * page can describe a different moment from anything else on it. The period
 * control re-queries; the top-clubs sort re-queries but keeps the previous
 * rows on screen rather than collapsing the card.
 *
 * `users_by_city` and MRR are in the design and absent from the API: there is
 * no city column and no subscription domain. Rather than render an empty
 * chart, the panels simply are not here -- see API_SPEC_V2.md §3.1.
 *
 * Two views of the one response (the View control; Operations on every
 * load, so the queues are never hidden by yesterday's presentation):
 *
 * - Operations, the day-to-day: what needs a decision (the doors' attention
 *   list, retention due, what is live), today and the week ahead, the
 *   averages, the period's trend, money kept and lost (refunds, failed
 *   payments), clubs awaiting verification, and the top clubs.
 * - Pitch, what to show someone outside: the headline totals band, plan
 *   revenue, growth by month, the period's trend, the funnel from discovery
 *   to the door, the top clubs and the breakdowns -- and none of the
 *   internal queues.
 */
type Series = "users" | "events" | "registrations" | "revenue";

const SERIES: ReadonlyArray<{
  key: Series;
  label: string;
  icon: React.ReactNode;
  money?: boolean;
}> = [
  { key: "users", label: "New users", icon: <UserPlusIcon className="size-3.5" /> },
  { key: "events", label: "Events hosted", icon: <CalendarCheckIcon className="size-3.5" /> },
  { key: "registrations", label: "Registrations", icon: <TicketIcon className="size-3.5" /> },
  { key: "revenue", label: "Captured revenue", icon: <IndianRupeeIcon className="size-3.5" />, money: true },
];

/**
 * Indian compact currency.
 *
 * Applied from a thousand upwards, not a lakh: engaging only above ₹1,00,000
 * left a column reading "₹1.1L" beside "₹18,200.00", which is two formats for
 * one quantity and stops the column scanning as a ranking.
 */
function lakh(value: number): string {
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(1)}L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)}k`;
  return formatCurrency(value);
}

function monthLabel(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-IN", { month: "short" });
}

function BandStat({ label, value, note, estimate = false }: { label: string; value: string; note: string; estimate?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] text-white/75">{label}</span>
      <span
        className="truncate font-mono text-[28px] leading-[1.05] font-semibold tracking-[-0.03em] text-white sm:text-[34px]"
        title={estimate ? "An estimate from the database's own count of rows, within about a percent" : undefined}
      >
        {value}
      </span>
      <span className="truncate text-[12px] text-white/70">{note}</span>
    </div>
  );
}

/** Monthly bars. The current month is lit so "so far" reads as incomplete. */
function GrowthBars({
  points,
  money,
}: {
  points: AdminOverview["growth"]["users"];
  money?: boolean;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div className="flex h-[100px] items-end gap-2">
      {points.map((point, i) => (
        <div
          key={point.month ?? i}
          className="flex h-full flex-1 flex-col items-center justify-end gap-1"
        >
          <span className="text-[10.5px] text-ink-2">
            {money ? lakh(point.value) : formatNumber(point.value)}
          </span>
          <div
            className={cn(
              "w-full max-w-[34px] rounded-t-[4px] rounded-b-[2px]",
              i === points.length - 1
                ? "bg-brand"
                : "bg-brand/45"
            )}
            style={{ height: `${Math.max(2, (point.value / max) * 80)}px` }}
          />
          <span className="text-[10.5px] text-ink-3">
            {monthLabel(point.month)}
          </span>
        </div>
      ))}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <Skeleton className="h-[140px] w-full rounded-[var(--radius-card)]" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-[220px] w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-[220px] w-full rounded-[var(--radius-card)]" />
      </div>
      <Skeleton className="h-[240px] w-full rounded-[var(--radius-card)]" />
    </div>
  );
}


/**
 * Two polylines over a filled area, drawn in a 600x200 viewBox and stretched.
 *
 * Hand-rolled rather than a chart library: the design wants a solid current
 * line, a dashed previous one and a tinted fill, and nothing else -- no axes,
 * grid, tooltip or legend chrome. Pulling in recharts to then hide all of it
 * costs more than the fifteen lines of geometry.
 */
function ChartLines({
  series,
  data,
  money,
}: {
  series: Series;
  data: AdminOverview;
  money: boolean;
}) {
  const current = data.trends.series.map((p) => p[series]);
  // The previous window is reported as a total, not a series, so the dashed
  // line is its daily mean -- a flat reference, which is what a comparison
  // against a period you cannot see day-by-day honestly is.
  const previousMean =
    current.length > 0 ? data.trends.previous_totals[series] / current.length : 0;

  const max = Math.max(1, ...current, previousMean) * 1.1;
  const points = (values: number[]) =>
    values
      .map((v, i) => {
        const x = values.length > 1 ? (i / (values.length - 1)) * 600 : 0;
        return `${x.toFixed(1)},${(200 - (v / max) * 200).toFixed(1)}`;
      })
      .join(" ");

  const fmt = (v: number) =>
    money ? (v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${Math.round(v)}`) : String(Math.round(v));

  if (current.length === 0) {
    return (
      <span className="py-10 text-center text-[13px] text-ink-2">
        No activity in this window.
      </span>
    );
  }

  return (
    <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2">
      <div className="flex h-[200px] flex-col justify-between text-right text-[10.5px] text-ink-3">
        <span>{fmt(max)}</span>
        <span>{fmt(max / 2)}</span>
        <span>0</span>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <svg
          viewBox="0 0 600 200"
          preserveAspectRatio="none"
          className="block h-[200px] w-full overflow-visible"
          role="img"
          aria-label={`${series} per day, against the previous period`}
        >
          <polygon
            points={`${points(current)} 600,200 0,200`}
            className="fill-[var(--brand-soft)]"
          />
          <polyline
            points={points(current.map(() => previousMean))}
            className="fill-none stroke-[var(--ink-3)]"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={points(current)}
            className="fill-none stroke-[var(--brand)]"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="flex justify-between text-[10.5px] text-ink-3">
          <span>{data.trends.series[0]?.date.slice(5)}</span>
          <span>Today</span>
        </div>
      </div>
    </div>
  );
}

export function AdminOverviewV2() {
  const [days, setDays] = React.useState<number>(30);
  const [topBy, setTopBy] = React.useState<TopClubSort>("followers");
  const [series, setSeries] = React.useState<Series>("users");
  const [mode, setMode] = React.useState<"ops" | "pitch">("ops");
  const pitch = mode === "pitch";

  const { data, isPending, isError, error, refetch } = useAdminOverview(days, topBy);

  if (isPending) return <OverviewSkeleton />;

  if (isError || !data) {
    return (
      <div className="flex max-w-[520px] flex-col items-start gap-2.5 py-14">
        <span className="text-[22px]">Couldn&apos;t load this section</span>
        <span className="text-[14px] text-pretty text-ink-2">
          The API returned an error. Nothing was changed.
        </span>
        <code className="w-full rounded-[var(--radius-md)] bg-surface px-3 py-2.5 font-mono text-[12.5px] text-ink shadow-card">
          GET /admin/overview → {error?.message ?? "failed"}
        </code>
        <Button className="mt-2" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const { totals, today, running, averages, growth, breakdowns, funnel, money } = data;
  const maxFunnel = Math.max(1, ...funnel.map((f) => f.value));
  // Counts past a million rows are the planner's estimate: "≈" before them.
  const rough = estimatedTotals(data.estimated);

  const summary = [
    ["Users", approx(formatNumber(totals.users), rough.has("users"))],
    ["Clubs", `${totals.clubs} (${totals.verified_clubs} verified)`],
    ["Organisations", formatNumber(totals.organisations)],
    ["Events hosted", formatNumber(totals.events)],
    ["Registrations", approx(formatNumber(totals.registrations), rough.has("registrations"))],
    ["Attendance rate", approx(`${totals.attendance_rate}%`, rough.has("attendance_rate"))],
    ["GMV all time", formatCurrency(totals.gmv)],
    ["Average rating", `${averages.average_rating} from ratings`],
  ] as const;

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-wrap items-end gap-3.5">
        <div className="flex-1 basis-[300px]">
          <h2 className="m-0 text-[26px] leading-tight">{pitch ? "MyOtherApp in numbers" : "Is the platform healthy?"}</h2>
          <span className="text-[13px] text-ink-3">
            {new Date(data.generated_at).toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="View"
            value={mode}
            onChange={setMode}
            options={[
              { value: "ops", label: "Operations", icon: <WrenchIcon className="size-3.5" /> },
              { value: "pitch", label: "Pitch view", icon: <PresentationIcon className="size-3.5" /> },
            ]}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const text =
                `MyOtherApp — platform snapshot\n` +
                summary.map(([k, v]) => `• ${k}: ${v}`).join("\n");
              void navigator.clipboard?.writeText(text);
              toast.success("Summary copied");
            }}
          >
            <CopyIcon /> Copy summary
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const csv =
                "metric,value\n" +
                summary.map(([k, v]) => `"${k}","${v}"`).join("\n");
              const url = URL.createObjectURL(
                new Blob(["﻿" + csv], { type: "text/csv" })
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "platform-snapshot.csv";
              a.click();
              URL.revokeObjectURL(url);
              toast.success("Snapshot exported");
            }}
          >
            <FileDownIcon /> Export
          </Button>
          <Segmented
            label="Reporting period"
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            options={[
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
            ]}
          />
        </div>
      </header>

      {pitch ? null : <PlatformDoorsPanel />}

      <RevenueStrip />

      {/* The one saturated band on the page: saturation as presence. The
          headline for someone outside; Operations reads the same totals in
          its panels. */}
      {pitch ? (
        <section className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-x-6 gap-y-[18px] overflow-hidden rounded-[var(--radius-card)] bg-[radial-gradient(90%_140%_at_0%_0%,var(--hero-from),var(--hero-to)_60%)] px-5 py-6 shadow-[var(--elev-hero)] sm:px-7 sm:py-[26px]">
          <BandStat label="Users" value={approx(formatNumber(totals.users), rough.has("users"))} note={`${today.new_users} today`} estimate={rough.has("users")} />
          <BandStat label="Clubs" value={formatNumber(totals.clubs)} note={`${totals.verified_clubs} verified`} />
          <BandStat label="Organisations" value={formatNumber(totals.organisations)} note="colleges and communities" />
          <BandStat label="Events hosted" value={formatNumber(totals.events)} note={`${totals.upcoming_events} upcoming`} />
          <BandStat label="Registrations" value={approx(formatNumber(totals.registrations), rough.has("registrations"))} note={`${approx(`${totals.attendance_rate}%`, rough.has("attendance_rate"))} turned up`} estimate={rough.has("registrations")} />
          <BandStat label="GMV, all time" value={lakh(totals.gmv)} note="captured, net of nothing" />
        </section>
      ) : null}

      {pitch ? null : (
        <div className="flex flex-wrap items-stretch gap-3.5">
          <Panel className="min-w-0 flex-[1.2_1_380px]">
            <PanelTitle
              aside={`${today.events_today} on today`}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-brand shadow-[0_0_10px_var(--brand)]"
                />
                Today
              </span>
            </PanelTitle>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              {[
                [formatNumber(today.events_today), "events on today"],
                [formatNumber(today.registrations), "registrations"],
                [formatNumber(today.check_ins), "check-ins"],
                [formatCurrency(today.collected), "collected"],
                [formatNumber(today.new_users), "new users"],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="flex flex-col gap-0.5 rounded-[var(--radius-md)] bg-sunken px-3 py-2.5"
                >
                  <span className="text-[22px]">{value}</span>
                  <span className="text-[11.5px] text-ink-2">{label}</span>
                </div>
              ))}
            </div>

            <Micro>Running today and next 7 days</Micro>
            {running.length === 0 ? (
              <span className="text-[13px] text-ink-2">
                Nothing scheduled this week.
              </span>
            ) : (
              running.map((event) => (
                <RuleRow
                  key={event.id}
                  className="grid grid-cols-[76px_minmax(0,1fr)_90px] items-center gap-2.5 text-[13px] sm:grid-cols-[76px_minmax(0,1fr)_90px_90px]"
                >
                  <span className={event.is_today ? "text-brand" : "text-ink-2"}>
                    {event.is_today
                      ? "Today"
                      : event.event_datetime
                        ? new Date(event.event_datetime).toLocaleDateString("en-IN", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })
                        : "—"}
                  </span>
                  <Link href={`/events/${event.id}`} className="flex min-w-0 flex-col hover:underline">
                    <span className="truncate text-ink">{event.name}</span>
                    <span className="truncate text-[11.5px] text-ink-3">
                      {event.club ?? "—"}
                    </span>
                  </Link>
                  <span className="text-right text-ink-2">
                    {formatNumber(event.registrations)} regs
                  </span>
                  <span className="hidden text-right text-ink-2 sm:block">
                    {event.has_fee ? formatCurrency(event.reg_fee) : "Free"}
                  </span>
                </RuleRow>
              ))
            )}
          </Panel>

          <Panel className="min-w-0 flex-[1_1_320px]">
            <PanelTitle>Averages</PanelTitle>
            {[
              ["Registrations per event", formatNumber(averages.registrations_per_event)],
              ["Attendance rate", `${averages.attendance_rate}%`],
              ["View → sign-up", `${averages.view_to_signup}%`],
              ["Average ticket price", formatCurrency(averages.average_ticket_price)],
              ["Revenue per paid event", formatCurrency(averages.revenue_per_paid_event)],
              ["Followers per club", formatNumber(averages.followers_per_club)],
              ["Events per club", formatNumber(averages.events_per_club)],
              ["Event rating", `${averages.average_rating} ★`],
            ].map(([label, value]) => (
              <RuleRow key={label} className="flex items-baseline justify-between gap-2.5">
                <span className="min-w-0 truncate text-[13px] text-ink-2">{label}</span>
                <span className="shrink-0 text-[15px]">{value}</span>
              </RuleRow>
            ))}
          </Panel>
        </div>
      )}

      {pitch ? (
        <Panel className="p-5">
          <PanelTitle aside="cumulative where marked">Growth by month</PanelTitle>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-[18px]">
            {[
              ["Users", growth.users, false],
              ["Verified clubs", growth.clubs, false],
              ["Events per month", growth.events, false],
              ["GMV per month", growth.gmv, true],
            ].map(([label, points, money]) => (
              <div key={label as string} className="flex flex-col gap-2">
                <span className="text-[13px] text-ink-2">
                  {label as string}
                </span>
                <GrowthBars
                  points={points as AdminOverview["growth"]["users"]}
                  money={money as boolean}
                />
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {pitch ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3.5">
          {[
            ["Events by type", `${totals.events} events`, breakdowns.events_by_type],
            ["Clubs by organisation", `${totals.clubs} clubs`, breakdowns.clubs_by_organisation],
            ["How users sign in", `${approx(String(totals.users), rough.has("users"))} users`, breakdowns.users_by_provider],
          ].map(([title, sub, rows]) => {
            const list = rows as AdminOverview["breakdowns"]["events_by_type"];
            const max = Math.max(1, ...list.map((r) => r.value));
            return (
              <Panel key={title as string} className="min-w-0 p-5">
                <PanelTitle aside={sub as string}>{title as string}</PanelTitle>
                {list.length === 0 ? (
                  <span className="text-[13px] text-ink-2">
                    Nothing to show yet.
                  </span>
                ) : (
                  list.map((row) => (
                    <div key={row.label} className="flex flex-col gap-1">
                      <div className="flex justify-between text-[12.5px]">
                        <span className="truncate capitalize">{row.label}</span>
                        <span className="text-ink-2">
                          {formatNumber(row.value)}
                        </span>
                      </div>
                      <Meter value={row.value} max={max} />
                    </div>
                  ))
                )}
              </Panel>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start gap-3.5">
        {pitch ? (
          <Panel className="min-w-0 flex-[1_1_340px]">
            <PanelTitle aside="all events, all time">From discovery to the door</PanelTitle>
            {funnel.map((stage, i) => (
              <div key={stage.label} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[13px]">
                  <span>{stage.label}</span>
                  <span>
                    {formatNumber(stage.value)}
                    {stage.of_previous !== null ? (
                      <span className="ml-2 text-ink-3">
                        {stage.of_previous}%
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="h-5 overflow-hidden rounded-[4px] bg-sunken">
                  <div
                    className={cn(
                      "h-full rounded-[4px]",
                      i === 0
                        ? "bg-ink-3/60"
                        : i === 2
                          ? "bg-brand"
                          : "bg-brand/70"
                    )}
                    style={{
                      width: `${Math.max(2, Math.sqrt(stage.value / maxFunnel) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </Panel>
        ) : null}

        <Panel className="min-w-0 flex-[1.3_1_400px] gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[15px]">Top clubs</span>
            <Segmented
              label="Rank clubs by"
              value={topBy}
              onChange={setTopBy}
              options={[
                { value: "followers", label: "Followers" },
                { value: "registrations", label: "Registrations" },
                { value: "revenue", label: "Revenue" },
              ]}
            />
          </div>
          {data.top_clubs.length === 0 ? (
            <span className="text-[13px] text-ink-2">
              No clubs yet.
            </span>
          ) : (
            data.top_clubs.map((club, i) => (
              <RuleRow
                key={club.id}
                className="grid grid-cols-[24px_minmax(0,1fr)_90px] items-center gap-2.5 text-[13px] md:grid-cols-[24px_minmax(0,1fr)_90px_90px_100px]"
              >
                <span className="text-brand">{i + 1}</span>
                <Link href={`/clubs/${club.id}`} className="flex min-w-0 flex-col hover:underline">
                  <span className="truncate">{club.name}</span>
                  <span className="truncate text-[11.5px] text-ink-3">
                    {club.organisation ?? "—"}
                  </span>
                </Link>
                <span className={cn("text-right", topBy === "followers" ? "text-ink" : "text-ink-3")}>
                  {formatNumber(club.followers)} fol.
                </span>
                <span className={cn("hidden text-right md:block", topBy === "registrations" ? "text-ink" : "text-ink-3")}>
                  {formatNumber(club.registrations)} regs
                </span>
                <span className={cn("hidden text-right md:block", topBy === "revenue" ? "text-ink" : "text-ink-3")}>
                  {club.revenue ? lakh(club.revenue) : "Free"}
                </span>
              </RuleRow>
            ))
          )}
        </Panel>
      </div>

      {/* KPI cards double as the chart's series selector, so the number being
          read and the line being looked at cannot drift apart. */}
      <section className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        {SERIES.map((option) => {
          const current = data.trends.totals[option.key];
          const previous = data.trends.previous_totals[option.key];
          const change = changeOf(current, previous, option.key === "revenue" ? false : false);
          const active = series === option.key;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={active}
              onClick={() => setSeries(option.key)}
              className={cn(
                "relative flex flex-col gap-1.5 overflow-hidden rounded-[var(--radius-md)] p-4 text-left transition-shadow",
                active
                  ? "bg-brand-soft border-brand-line border"
                  : "bg-surface border-line-soft shadow-card hover:border-brand-line border"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-0 left-4 h-0.5 w-8",
                  active ? "bg-brand" : "bg-transparent"
                )}
              />
              <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
                {option.icon}
                {option.label}
              </span>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-[28px] tracking-[-0.02em]">
                  {option.money ? formatCurrency(current) : formatNumber(current)}
                </span>
                {change ? (
                  <span
                    className={cn(
                      "rounded-[999px] px-2 py-0.5 text-[12px] whitespace-nowrap",
                      change.direction === "flat"
                        ? "bg-raised text-ink-2"
                        : change.direction === "up"
                          ? "bg-admit-soft text-admit"
                          : "bg-refuse-soft text-refuse"
                    )}
                  >
                    {change.label}
                  </span>
                ) : null}
              </div>
              <span className="text-[12px] text-ink-3">
                vs previous {days} days
              </span>
            </button>
          );
        })}
      </section>


      <Panel className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[15px]">
            {SERIES.find((o) => o.key === series)?.label} per day
          </span>
          <div className="flex gap-3.5 text-[12px] text-ink-2">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3.5 bg-brand" />
              This period
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 border-t-2 border-dashed border-ink-3" />
              Previous period
            </span>
          </div>
        </div>
        <ChartLines series={series} data={data} money={!!SERIES.find((o) => o.key === series)?.money} />
      </Panel>

      {pitch ? null : (
        <div className="flex flex-wrap items-start gap-3.5">
          <Panel className="min-w-0 flex-[1_1_320px] p-5">
            <PanelTitle aside={`last ${days} days`}>Revenue retained</PanelTitle>
            <div className="flex items-baseline gap-2.5">
              <span className="text-[40px] tracking-[-0.03em] text-brand">
                {money.retained_share}%
              </span>
              <span className="text-[13px] text-ink-2">
                of captured money kept
              </span>
            </div>
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-[5px]">
              <div className="bg-brand" style={{ flex: Math.max(1, money.net) }} />
              <div className="bg-ink-3" style={{ flex: Math.max(0, money.refunded) }} />
            </div>
            {[
              ["Captured", formatCurrency(money.captured), "var(--ink)"],
              ["Refunded", `−${formatCurrency(money.refunded)}`, "var(--ink-2)"],
              ["Net kept", formatCurrency(money.net), "var(--brand)"],
              ["Failed payments", formatNumber(money.failed), "var(--ink-2)"],
            ].map(([label, value, color]) => (
              <div key={label} className="flex justify-between py-1 text-[13px]">
                <span className="text-ink-2">{label}</span>
                <span style={{ color }}>{value}</span>
              </div>
            ))}
          </Panel>

          <Panel className="min-w-0 flex-[1_1_320px] p-5">
            <PanelTitle>Platform composition</PanelTitle>
            {[
              ["Verified clubs", totals.verified_clubs, "Awaiting", totals.pending_clubs],
              ["Upcoming events", totals.upcoming_events, "Past", totals.past_events],
            ].map(([aLabel, aValue, bLabel, bValue]) => {
              const total = Math.max(1, (aValue as number) + (bValue as number));
              return (
                <div key={aLabel as string} className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-[12.5px]">
                    <span>
                      {aLabel as string}{" "}
                      <span className="text-brand">
                        {Math.round(((aValue as number) / total) * 100)}%
                      </span>
                    </span>
                    <span className="text-ink-2">
                      {bLabel as string} {Math.round(((bValue as number) / total) * 100)}%
                    </span>
                  </div>
                  <div className="flex h-2 gap-0.5 overflow-hidden rounded-[4px]">
                    <div className="bg-brand" style={{ flex: Math.max(1, aValue as number) }} />
                    <div className="bg-ink-3/60" style={{ flex: Math.max(0, bValue as number) }} />
                  </div>
                </div>
              );
            })}

            <Link
              href="/subscriptions"
              className="mt-1 flex flex-col gap-1.5 rounded-[var(--radius-md)] bg-sunken p-3.5 transition-shadow hover:shadow-[inset_0_0_0_1px_var(--brand)]"
            >
              <span className="flex items-center justify-between text-[15px]">
                Club subscriptions
                <ArrowRightIcon className="size-4 text-ink-3" />
              </span>
              <span className="text-[12.5px] text-ink-2">
                Plans, who is on which, and the free plans given to clubs.
              </span>
            </Link>
          </Panel>
        </div>
      )}
    </div>
  );
}
