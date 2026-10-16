"use client";

import * as React from "react";
import { CardLabel, FigurePanel, StatusBadge } from "@moa/ui";

import { formatTime, minutesBetween, plural } from "../format";
import type { EventFigures } from "./schemas";

const ACCENT = "var(--brand)";
const ADMIT = "var(--admit)";
const INK = "var(--ink-3)";
const LINE = "var(--line)";
const SOFT = "color-mix(in srgb, var(--brand) 35%, transparent)";

const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;

/**
 * Admissions per quarter hour with the running total over it.
 *
 * Bars read the left axis (how busy the door was), the line reads the right
 * (how much of the house is in). The event's start is a dashed rule so early
 * arrivals and a late door are both visible at a glance.
 */
export function ArrivalCurve({ a, startsAt, timezone }: { a: EventFigures; startsAt: string; timezone: string }) {
  const id = React.useId();
  const W = 640;
  const H = 150;
  const PAD = { l: 26, r: 30, t: 18, b: 24 };
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const buckets = a.arrivals;
  const n = buckets.length;
  const peak = Math.max(1, a.timing.peak_admits);
  const total = Math.max(1, buckets.at(-1)?.cumulative ?? 0);
  const gap = n > 40 ? 0.5 : 1.5;
  const bw = iw / n;
  const x = (i: number) => PAD.l + i * bw;
  const yBar = (v: number) => PAD.t + ih - (v / peak) * ih;
  const yLine = (v: number) => PAD.t + ih - (v / total) * ih;
  const line = buckets.map((b, i) => `${i === 0 ? "M" : "L"}${(x(i) + bw / 2).toFixed(1)},${yLine(b.cumulative).toFixed(1)}`).join(" ");
  const first = new Date(buckets[0]!.starts_at).getTime();
  const step = 15 * 60_000;
  const posOf = (iso: string | null) => {
    if (!iso) return null;
    const i = (new Date(iso).getTime() - first) / step;
    return i < 0 || i > n ? null : PAD.l + i * bw;
  };
  const startX = posOf(startsAt);
  const halfX = posOf(a.timing.half_house_at);
  // Two rules close together: the earlier label reads leftwards so neither covers the other.
  const crowded = startX !== null && halfX !== null && Math.abs(startX - halfX) < 56;
  const markers = [
    startX !== null ? { x: startX, label: "START", color: INK, dash: "3 3", flip: crowded && startX < halfX! } : null,
    halfX !== null ? { x: halfX, label: "½ HOUSE", color: ADMIT, dash: "2 3", flip: crowded && halfX < startX! } : null,
  ].filter((m): m is NonNullable<typeof m> => m !== null);
  // Time labels: never more than one per ~90px so they cannot overlap.
  const every = Math.max(1, Math.ceil(n / Math.floor(iw / 90)));
  const peakIdx = buckets.findIndex((b) => b.starts_at === a.timing.peak_starts_at);
  const caption = `Admissions per quarter hour, ${formatTime(buckets[0]!.starts_at, timezone)} to ${formatTime(buckets.at(-1)!.starts_at, timezone)}; peak ${a.timing.peak_admits} at ${a.timing.peak_starts_at ? formatTime(a.timing.peak_starts_at, timezone) : "—"}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-labelledby={`${id}-title`}>
      <title id={`${id}-title`}>{caption}</title>
      {[0.5, 1].map((f) => (
        <g key={f}>
          <line x1={PAD.l} x2={W - PAD.r} y1={yBar(peak * f)} y2={yBar(peak * f)} stroke={LINE} strokeWidth={1} opacity={0.6} />
          <text x={PAD.l - 5} y={yBar(peak * f) + 3.5} textAnchor="end" fontSize={9} fill={INK} fontFamily="ui-monospace, monospace">
            {Math.round(peak * f)}
          </text>
        </g>
      ))}
      <text x={W - PAD.r + 5} y={PAD.t + 3.5} fontSize={9} fill={INK} fontFamily="ui-monospace, monospace">
        {total}
      </text>
      <text x={W - PAD.r + 5} y={yLine(total / 2) + 3.5} fontSize={9} fill={INK} fontFamily="ui-monospace, monospace">
        {Math.round(total / 2)}
      </text>
      <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} stroke={LINE} strokeWidth={1} />

      {buckets.map((b, i) => (
        <rect
          key={b.starts_at}
          x={x(i) + gap / 2}
          y={yBar(b.admits)}
          width={Math.max(0.5, bw - gap)}
          height={Math.max(0, PAD.t + ih - yBar(b.admits))}
          rx={bw > 6 ? 1.5 : 0}
          fill={i === peakIdx ? ACCENT : SOFT}
        />
      ))}
      <path d={line} fill="none" stroke={ADMIT} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      {n > 0 ? <circle cx={x(n - 1) + bw / 2} cy={yLine(buckets[n - 1]!.cumulative)} r={3} fill={ADMIT} /> : null}

      {markers.map((m) => (
        <g key={m.label}>
          <line x1={m.x} x2={m.x} y1={PAD.t - 4} y2={PAD.t + ih} stroke={m.color} strokeWidth={1} strokeDasharray={m.dash} />
          <text x={m.x + (m.flip ? -3 : 3)} y={PAD.t - 8} textAnchor={m.flip ? "end" : "start"} fontSize={8.5} fill={m.color} fontFamily="ui-monospace, monospace">
            {m.label}
          </text>
        </g>
      ))}

      {buckets.map((b, i) =>
        i === n - 1 || (i % every === 0 && (n - 1 - i) * bw > 64) ? (
          <text
            key={`t${b.starts_at}`}
            x={x(i) + (i === n - 1 ? bw : 0)}
            y={H - 8}
            textAnchor={i === n - 1 ? "end" : "start"}
            fontSize={9}
            fill={INK}
            fontFamily="ui-monospace, monospace"
          >
            {formatTime(b.starts_at, timezone)}
          </text>
        ) : null
      )}
    </svg>
  );
}

function Stat({ k, v, sub }: { k: string; v: React.ReactNode; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-ink-3 font-mono text-[10px] tracking-[0.06em] uppercase">{k}</div>
      <div className="mt-0.5 font-mono text-[15px] tabular-nums">{v}</div>
      {sub ? <div className="text-ink-3 text-[11px]">{sub}</div> : null}
    </div>
  );
}

/**
 * The curve and its timing: first through, the busiest quarter hour, when
 * half the house was in, last through. Reads the live figures while the
 * list exists and the closeout report's frozen copy once it is gone.
 */
export function ArrivalCurveCard({ a, startsAt, timezone, fromReport, className }: { a: EventFigures; startsAt: string; timezone: string; fromReport: boolean; className?: string }) {
  const nobody = a.total_admitted === 0 || a.arrivals.length === 0;
  const t = a.timing;
  return (
    <FigurePanel className={className}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <CardLabel>Arrival curve</CardLabel>
        {fromReport ? <StatusBadge tone="default" label="From closeout report" /> : null}
        <span className="flex-1" />
        <span className="text-ink-3 flex items-center gap-3 font-mono text-[10px] tracking-[0.04em] uppercase">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="bg-brand/35 inline-block h-2 w-3 rounded-[2px]" /> per 15 min
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-[2px] w-3 rounded-full bg-admit" /> in the house
          </span>
        </span>
      </div>
      {nobody ? (
        <p className="text-ink-3 py-8 text-center text-[12.5px]">The curve draws itself from the first admission.</p>
      ) : (
        <>
          <ArrivalCurve a={a} startsAt={startsAt} timezone={timezone} />
          <div className="border-line-soft mt-3 grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-4">
            <Stat k="First through" v={t.first_admit_at ? formatTime(t.first_admit_at, timezone) : "—"} sub={t.first_admit_at ? `${signed(minutesBetween(startsAt, t.first_admit_at))} min from start` : undefined} />
            <Stat k="Busiest quarter hour" v={t.peak_starts_at ? formatTime(t.peak_starts_at, timezone) : "—"} sub={t.peak_starts_at ? `${plural(t.peak_admits, "admission")} in 15 min` : undefined} />
            <Stat k="Half the house in" v={t.half_house_at ? formatTime(t.half_house_at, timezone) : "—"} sub={t.half_house_minutes !== null ? `${signed(t.half_house_minutes)} min from start` : undefined} />
            <Stat k="Last through" v={t.last_admit_at ? formatTime(t.last_admit_at, timezone) : "—"} sub={t.first_admit_at && t.last_admit_at ? `door busy ${minutesBetween(t.first_admit_at, t.last_admit_at)} min` : undefined} />
          </div>
        </>
      )}
    </FigurePanel>
  );
}
