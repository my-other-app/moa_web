"use client";

import * as React from "react";
import { CardLabel, FigurePanel, Notice, Skeleton, StatTile } from "@moa/ui";

import { useUsage } from "../queries";
import { usageTotals, type IntegrationsStatus, type UsageDay } from "../schemas";

/*
 * Theme tokens, as the door's arrivals chart: the quiet bars are the
 * brand's line tint, errors the refuse colour stacked on top, so the chart
 * reads in light and in dark without a colour of its own.
 */
const BAR = "var(--brand-line)";
const ERR = "var(--refuse)";
const RULE = "var(--line)";
const INK = "var(--ink-3)";
const MONO = "var(--font-plex-mono), ui-monospace, monospace";

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const n = (v: number) => v.toLocaleString("en-IN");

/** Requests per day, errors drawn in red at the foot of each bar. */
export function UsageChart({ days }: { days: readonly UsageDay[] }) {
  const id = React.useId();
  const count = days.length;
  if (count === 0) return null;
  const W = 640;
  const H = 150;
  const PAD = { l: 36, r: 8, t: 12, b: 22 };
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const peak = Math.max(1, ...days.map((d) => d.requests));
  const bw = iw / count;
  const gap = count > 40 ? 0.5 : 2;
  const x = (i: number) => PAD.l + i * bw;
  const y = (v: number) => PAD.t + ih - (v / peak) * ih;
  const every = Math.max(1, Math.ceil(count / Math.max(1, Math.floor(iw / 72))));
  const totals = usageTotals(days);
  const caption = `API requests per day from ${dayLabel(days[0]!.date)} to ${dayLabel(days[count - 1]!.date)}: ${n(totals.requests)} in all, ${n(totals.errors)} of them errors; the busiest day had ${n(peak)}.`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-labelledby={`${id}-t`}>
      <title id={`${id}-t`}>{caption}</title>
      {[0.5, 1].map((f) => (
        <g key={f}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(peak * f)} y2={y(peak * f)} stroke={RULE} strokeDasharray="2 4" />
          <text x={PAD.l - 6} y={y(peak * f) + 3.5} textAnchor="end" fontSize={9.5} fill={INK} fontFamily={MONO}>
            {n(Math.round(peak * f))}
          </text>
        </g>
      ))}
      <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} stroke={RULE} />
      {days.map((d, i) => (
        <g key={d.date}>
          <title>{`${dayLabel(d.date)}: ${n(d.requests)} requests, ${n(d.errors)} errors`}</title>
          <rect x={x(i) + gap / 2} y={y(d.requests)} width={Math.max(0.5, bw - gap)} height={Math.max(0, PAD.t + ih - y(d.requests))} rx={bw > 6 ? 2 : 0} fill={BAR} />
          {d.errors > 0 ? (
            <rect x={x(i) + gap / 2} y={y(Math.min(d.errors, d.requests || d.errors))} width={Math.max(0.5, bw - gap)} height={Math.max(1, PAD.t + ih - y(Math.min(d.errors, d.requests || d.errors)))} rx={bw > 6 ? 2 : 0} fill={ERR} />
          ) : null}
        </g>
      ))}
      {days.map((d, i) =>
        i === count - 1 || (i % every === 0 && (count - 1 - i) * bw > 56) ? (
          <text key={`t${d.date}`} x={x(i) + (i === count - 1 ? bw : 0)} y={H - 6} textAnchor={i === count - 1 ? "end" : "start"} fontSize={9.5} fill={INK} fontFamily={MONO}>
            {dayLabel(d.date)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/** The last 30 days: how many requests the club's keys and apps made, and how many were refused or failed. */
export function UsagePanel({ status }: { status: IntegrationsStatus }) {
  const usage = useUsage();
  const days = usage.data?.days ?? [];
  const totals = usageTotals(days);
  return (
    <div className="flex flex-col gap-3.5" role="region" aria-label="Usage">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Requests, 30 days" value={usage.isPending ? "…" : n(totals.requests)} />
        <StatTile label="Errors" value={usage.isPending ? "…" : n(totals.errors)} />
        <StatTile label="Error rate" value={usage.isPending ? "…" : `${(totals.errorRate * 100).toFixed(totals.errorRate && totals.errorRate < 0.01 ? 2 : 1)}%`} />
      </div>
      <FigurePanel className="flex flex-col gap-2 p-4">
        <CardLabel right={<span className="text-ink-3 text-[11px]">Errors in red</span>}>Requests per day</CardLabel>
        {usage.isPending ? (
          <Skeleton className="h-[150px] rounded-xl" />
        ) : usage.isError ? (
          <Notice tone="refuse" tag="Usage">
            We couldn&apos;t load the figures. Try again in a moment.
          </Notice>
        ) : totals.requests === 0 ? (
          <p className="text-ink-3 m-0 py-8 text-center text-[12.5px]">No requests in the last 30 days.</p>
        ) : (
          <UsageChart days={days} />
        )}
        {status.rate_limit ? (
          <p className="text-ink-3 m-0 text-[12px]">
            Your club may make {n(status.rate_limit.read_per_min)} reads and {n(status.rate_limit.write_per_min)} changes a minute. Past that, requests are refused for a moment (429) and count as errors.
          </p>
        ) : null}
      </FigurePanel>
    </div>
  );
}
