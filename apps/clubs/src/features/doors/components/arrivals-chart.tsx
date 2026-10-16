"use client";

import * as React from "react";
import { formatTime, type EventFigures } from "@moa/app-kit";

/*
 * Theme tokens, so the chart reads in light and in dark without a colour
 * of its own: the quiet bars are the brand's line tint, the busiest one is
 * the brand, the running total is admit.
 */
const BAR = "var(--brand-line)";
const PEAK = "var(--brand)";
const TOTAL = "var(--admit)";
const RULE = "var(--line)";
const INK = "var(--ink-3)";
const MONO = "var(--font-plex-mono), ui-monospace, monospace";
const STEP = 15 * 60_000;

/**
 * Admissions per quarter hour, with the running total drawn over them.
 * Bars read the left axis (how busy the door was), the line the right (how
 * much of the house is in). The start and the moment half the house was in
 * are marked, so an early crowd and a late door both show at a glance.
 */
export function ArrivalsChart({
  a,
  startsAt,
  timezone,
}: {
  a: EventFigures;
  startsAt: string;
  timezone: string;
}) {
  const id = React.useId();
  const buckets = a.arrivals;
  const n = buckets.length;
  if (n === 0) return null;
  const W = 640;
  const H = 160;
  const PAD = { l: 28, r: 32, t: 20, b: 24 };
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const peak = Math.max(1, ...buckets.map((b) => b.admits));
  const total = Math.max(1, buckets[n - 1]!.cumulative);
  const bw = iw / n;
  const gap = n > 40 ? 0.5 : 2;
  const x = (i: number) => PAD.l + i * bw;
  const yBar = (v: number) => PAD.t + ih - (v / peak) * ih;
  const yLine = (v: number) => PAD.t + ih - (v / total) * ih;
  const path = buckets
    .map(
      (b, i) =>
        `${i === 0 ? "M" : "L"}${(x(i) + bw / 2).toFixed(1)},${yLine(b.cumulative).toFixed(1)}`,
    )
    .join(" ");
  const first = new Date(buckets[0]!.starts_at).getTime();
  const at = (iso: string | null) => {
    if (!iso) return null;
    const i = (new Date(iso).getTime() - first) / STEP;
    return i < 0 || i > n ? null : PAD.l + i * bw;
  };
  const startX = at(startsAt);
  const halfX = at(a.timing.half_house_at);
  // Two rules close together: the earlier label reads leftwards so neither covers the other.
  const crowded =
    startX !== null && halfX !== null && Math.abs(startX - halfX) < 56;
  const markers = [
    startX !== null
      ? { x: startX, label: "Start", color: INK, flip: crowded && startX < halfX! }
      : null,
    halfX !== null
      ? { x: halfX, label: "Half in", color: TOTAL, flip: crowded && halfX < startX! }
      : null,
  ].filter((m): m is NonNullable<typeof m> => m !== null);
  const peakIdx = buckets.findIndex((b) => b.admits === peak);
  // Never more than one time label per ~90px, so they cannot overlap.
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 90))));
  const caption = `Admissions per quarter hour from ${formatTime(buckets[0]!.starts_at, timezone)} to ${formatTime(buckets[n - 1]!.starts_at, timezone)}; the busiest quarter hour admitted ${peak}; ${buckets[n - 1]!.cumulative} in all.`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="img"
      aria-labelledby={`${id}-t`}
    >
      <title id={`${id}-t`}>{caption}</title>
      {[0.5, 1].map((f) => (
        <g key={f}>
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={yBar(peak * f)}
            y2={yBar(peak * f)}
            stroke={RULE}
            strokeDasharray="2 4"
          />
          <text
            x={PAD.l - 6}
            y={yBar(peak * f) + 3.5}
            textAnchor="end"
            fontSize={9.5}
            fill={INK}
            fontFamily={MONO}
          >
            {Math.round(peak * f)}
          </text>
        </g>
      ))}
      <text x={W - PAD.r + 6} y={PAD.t + 3.5} fontSize={9.5} fill={TOTAL} fontFamily={MONO}>
        {total}
      </text>
      <text
        x={W - PAD.r + 6}
        y={yLine(total / 2) + 3.5}
        fontSize={9.5}
        fill={INK}
        fontFamily={MONO}
      >
        {Math.round(total / 2)}
      </text>
      <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} stroke={RULE} />
      {buckets.map((b, i) => (
        <rect
          key={b.starts_at}
          x={x(i) + gap / 2}
          y={yBar(b.admits)}
          width={Math.max(0.5, bw - gap)}
          height={Math.max(0, PAD.t + ih - yBar(b.admits))}
          rx={bw > 6 ? 2 : 0}
          fill={i === peakIdx && b.admits > 0 ? PEAK : BAR}
        >
          <title>{`${formatTime(b.starts_at, timezone)}: ${b.admits} admitted, ${b.cumulative} in`}</title>
        </rect>
      ))}
      <path
        d={path}
        fill="none"
        stroke={TOTAL}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={x(n - 1) + bw / 2}
        cy={yLine(buckets[n - 1]!.cumulative)}
        r={3}
        fill={TOTAL}
      />
      {markers.map((m) => (
        <g key={m.label}>
          <line
            x1={m.x}
            x2={m.x}
            y1={PAD.t - 4}
            y2={PAD.t + ih}
            stroke={m.color}
            strokeDasharray="3 3"
          />
          <text
            x={m.x + (m.flip ? -4 : 4)}
            y={PAD.t - 8}
            textAnchor={m.flip ? "end" : "start"}
            fontSize={9.5}
            fill={m.color}
          >
            {m.label}
          </text>
        </g>
      ))}
      {buckets.map((b, i) =>
        i === n - 1 || (i % every === 0 && (n - 1 - i) * bw > 64) ? (
          <text
            key={`t${b.starts_at}`}
            x={x(i) + (i === n - 1 ? bw : 0)}
            y={H - 7}
            textAnchor={i === n - 1 ? "end" : "start"}
            fontSize={9.5}
            fill={INK}
            fontFamily={MONO}
          >
            {formatTime(b.starts_at, timezone)}
          </text>
        ) : null,
      )}
    </svg>
  );
}
