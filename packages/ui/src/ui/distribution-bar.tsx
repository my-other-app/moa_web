import * as React from "react";

import { cn } from "../lib/cn";

/**
 * How a total splits across a handful of states, as one bar.
 *
 * Three counts in three separate stat cards make the reader do the division.
 * A single bar shows the proportion directly, which is the question actually
 * being asked of a composition ("are most clubs verified?").
 */
export type SegmentTone =
  | "brand"
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "neutral";

const fillClasses: Record<SegmentTone, string> = {
  brand: "bg-brand",
  success: "bg-emerald-500",
  warning: "bg-amber-400",
  destructive: "bg-red-500",
  info: "bg-blue-500",
  neutral: "bg-muted-foreground/40",
};

const dotClasses: Record<SegmentTone, string> = {
  brand: "bg-brand",
  success: "bg-emerald-500",
  warning: "bg-amber-400",
  destructive: "bg-red-500",
  info: "bg-blue-500",
  neutral: "bg-muted-foreground/40",
};

export interface DistributionSegment {
  key: string;
  label: string;
  value: number;
  tone: SegmentTone;
}

export interface ComputedSegment extends DistributionSegment {
  /** Whole percent. Across all segments these sum to exactly 100. */
  percent: number;
}

/**
 * Percentages for a bar, as whole numbers that sum to 100.
 *
 * Rounding each share independently gives 33/33/33 for equal thirds, which
 * renders as a bar with a visible gap at the end and reads as a bug. Largest
 * remainder assigns the leftover points to the segments that lost the most to
 * rounding, so the labels always account for the whole bar.
 *
 * Negative values are treated as zero rather than inverting a segment.
 */
export function computeSegments(
  segments: readonly DistributionSegment[]
): ComputedSegment[] {
  const safe = segments.map((s) => ({ ...s, value: Math.max(0, s.value) }));
  const total = safe.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return safe.map((s) => ({ ...s, percent: 0 }));

  const exact = safe.map((s) => (s.value / total) * 100);
  const floored = exact.map((n) => Math.floor(n));
  let remaining = 100 - floored.reduce((sum, n) => sum + n, 0);

  // Biggest fractional part first; ties keep the original order so the output
  // is stable across renders rather than reshuffling on every fetch.
  const order = exact
    .map((n, i) => ({ i, fraction: n - Math.floor(n) }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);

  const percent = [...floored];
  for (const { i } of order) {
    if (remaining <= 0) break;
    percent[i] = (percent[i] ?? 0) + 1;
    remaining -= 1;
  }

  return safe.map((s, i) => ({ ...s, percent: percent[i] ?? 0 }));
}

export interface DistributionBarProps {
  segments: readonly DistributionSegment[];
  /** Percentages above each segment, as in the reference layout. */
  showPercentLabels?: boolean;
  /** Dot + count + label beneath the bar. */
  showLegend?: boolean;
  emptyLabel?: string;
  className?: string;
}

function DistributionBar({
  segments,
  showPercentLabels = true,
  showLegend = true,
  emptyLabel = "Nothing to show yet",
  className,
}: DistributionBarProps) {
  const computed = computeSegments(segments);
  const total = computed.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="bg-muted h-2 w-full rounded-full" />
        <p className="text-muted-foreground text-xs">{emptyLabel}</p>
      </div>
    );
  }

  // Zero-valued segments are dropped from the bar so they cannot show as a
  // hairline, but they stay in the legend so the reader sees the state exists.
  const drawn = computed.filter((s) => s.percent > 0);

  return (
    <div className={cn("space-y-2", className)}>
      {showPercentLabels ? (
        <div className="flex gap-1">
          {drawn.map((s) => (
            <span
              key={s.key}
              style={{ width: `${s.percent}%` }}
              className="text-muted-foreground min-w-0 truncate text-xs font-medium tabular-nums"
            >
              {s.percent}%
            </span>
          ))}
        </div>
      ) : null}

      <div
        className="flex h-2 w-full gap-1 overflow-hidden"
        role="img"
        aria-label={computed
          .map((s) => `${s.label}: ${s.value} (${s.percent}%)`)
          .join(", ")}
      >
        {drawn.map((s) => (
          <span
            key={s.key}
            style={{ width: `${s.percent}%` }}
            className={cn("h-full rounded-full", fillClasses[s.tone])}
          />
        ))}
      </div>

      {showLegend ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
          {computed.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5 text-xs">
              <span
                className={cn("size-1.5 rounded-full", dotClasses[s.tone])}
                aria-hidden="true"
              />
              <span className="font-medium tabular-nums">{s.value}</span>
              <span className="text-muted-foreground">{s.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export { DistributionBar };
