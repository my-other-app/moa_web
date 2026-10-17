"use client";

import * as React from "react";
import { cn } from "@moa/ui";

import { compactPaise, formatPaise, monthLabel, shortMonth } from "../format";
import type { MonthPoint } from "../schemas";

/**
 * Money collected per month, refunds hanging below the line.
 *
 * Plain SVG, like the overview's charts: two series and one axis, so a
 * charting library would mostly be hidden chrome. Each month is one slot of
 * equal width in both the SVG and the label row beneath it, so the HTML labels
 * line up with the bars at any width. Collected bars rise from the baseline,
 * refunds fall from it, on one shared scale; the month table under the chart
 * is the same data as a table.
 */
const W = 600;
const H = 200;
const BAR = 0.56;

/** A bar with its data end rounded (4px): the top for a rising bar, the bottom for a falling one. */
function barPath(x: number, y: number, w: number, h: number, roundTop: boolean): string {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  if (roundTop) {
    return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
  }
  return `M${x},${y} V${y + h - r} Q${x},${y + h} ${x + r},${y + h} H${x + w - r} Q${x + w},${y + h} ${x + w},${y + h - r} V${y} Z`;
}

export function CollectedChart({ series }: { series: MonthPoint[] }) {
  const [active, setActive] = React.useState<number | null>(null);
  if (series.length === 0) {
    return <p className="text-ink-2 py-10 text-center text-[13px]">Nothing collected in this window.</p>;
  }

  const up = Math.max(0, ...series.map((p) => p.collected_paise));
  const down = Math.max(0, ...series.map((p) => p.refunded_paise));
  const span = Math.max(1, up + down);
  // The baseline sits where the two scales meet: refunds get only the room they need.
  const base = down > 0 ? (up / span) * H : H;
  const scale = H / span;
  const slot = W / series.length;
  const bw = slot * BAR;
  const point = active !== null ? series[active] : null;
  const current = series.length - 1;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2">
        <div className="text-ink-3 relative h-[200px] text-right text-[10.5px]" aria-hidden="true">
          <span className="absolute top-0 right-0">{compactPaise(up)}</span>
          <span className="absolute right-0 -translate-y-1/2" style={{ top: `${(base / H) * 100}%` }}>
            ₹0
          </span>
          {down > 0 ? <span className="absolute right-0 bottom-0">{compactPaise(-down)}</span> : null}
        </div>
        <div className="relative min-w-0">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="block h-[200px] w-full overflow-visible"
            role="img"
            aria-label={`Collected per month over ${series.length} months, refunds below the line`}
            onMouseLeave={() => setActive(null)}
          >
            <line x1={0} x2={W} y1={base} y2={base} className="stroke-[var(--line)]" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            {series.map((p, i) => {
              const x = i * slot + (slot - bw) / 2;
              const hu = p.collected_paise * scale;
              const hd = p.refunded_paise * scale;
              const lit = active === null || active === i;
              return (
                <g key={p.month} data-month={p.month} className={cn("transition-opacity", lit ? "opacity-100" : "opacity-45")}>
                  {hu > 0 ? <path d={barPath(x, base - Math.max(hu, 1), bw, Math.max(hu, 1), true)} className="fill-[var(--brand)]" data-series="collected" /> : null}
                  {/* 2px of surface between a month's two bars. */}
                  {hd > 0 ? <path d={barPath(x, base + 2, bw, Math.max(hd - 2, 1), false)} className="fill-[var(--ink-3)]" data-series="refunded" /> : null}
                  <rect
                    x={i * slot}
                    y={0}
                    width={slot}
                    height={H}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${monthLabel(p.month)}: ${formatPaise(p.collected_paise)} collected, ${formatPaise(p.refunded_paise)} refunded`}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className="cursor-default outline-none"
                  >
                    <title>{`${monthLabel(p.month)}: ${formatPaise(p.collected_paise)} collected, ${formatPaise(p.refunded_paise)} refunded`}</title>
                  </rect>
                </g>
              );
            })}
          </svg>
          {point !== null && point !== undefined && active !== null ? (
            <div
              role="tooltip"
              className="bg-surface border-line shadow-card pointer-events-none absolute top-1 z-10 flex -translate-x-1/2 flex-col gap-0.5 rounded-[10px] border px-2.5 py-2 text-[12px] whitespace-nowrap"
              style={{ left: `${((active + 0.5) / series.length) * 100}%` }}
            >
              <span className="text-ink font-medium">
                {monthLabel(point.month)}
                {active === current ? " · so far" : ""}
              </span>
              <span className="text-ink-2 flex items-center gap-1.5">
                <span className="bg-brand size-2 rounded-[2px]" aria-hidden="true" /> Collected {formatPaise(point.collected_paise)}
              </span>
              <span className="text-ink-2 flex items-center gap-1.5">
                <span className="bg-ink-3 size-2 rounded-[2px]" aria-hidden="true" /> Refunded {formatPaise(point.refunded_paise)}
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2" aria-hidden="true">
        <span />
        <div className="text-ink-3 flex text-[10.5px]">
          {series.map((p, i) => (
            <span key={p.month} className={cn("min-w-0 flex-1 truncate text-center", i === current && "text-ink-2")}>
              {series.length > 12 && i % 2 === 1 ? "" : shortMonth(p.month)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The chart's key: two series, so the legend is always there. */
export function CollectedLegend() {
  return (
    <div className="text-ink-2 flex gap-3.5 text-[12px]">
      <span className="flex items-center gap-1.5">
        <span className="bg-brand size-2.5 rounded-[2px]" aria-hidden="true" /> Collected
      </span>
      <span className="flex items-center gap-1.5">
        <span className="bg-ink-3 size-2.5 rounded-[2px]" aria-hidden="true" /> Refunded (below the line)
      </span>
    </div>
  );
}
