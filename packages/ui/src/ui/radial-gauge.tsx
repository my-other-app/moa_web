import * as React from "react";

import { cn } from "../lib/cn";

/**
 * One ratio, rendered as a dial with the figure in the middle.
 *
 * Used where the interesting thing is "how much of the whole", which a bare
 * number cannot carry: 124 GB means nothing without the 500, and the same is
 * true of revenue kept against revenue taken.
 */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** Percent of `total`, with the divide-by-zero case answered as 0 rather than NaN. */
export function toPercent(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return clampPercent((value / total) * 100);
}

export interface RadialGaugeProps {
  /** 0-100; values outside the range are clamped rather than overdrawing the arc. */
  percent: number;
  /** Large text in the centre. Defaults to the rounded percent. */
  value?: React.ReactNode;
  caption?: React.ReactNode;
  size?: number;
  thickness?: number;
  className?: string;
  trackClassName?: string;
  arcClassName?: string;
  /** Accessible description, since the dial itself is decorative SVG. */
  label: string;
}

function RadialGauge({
  percent,
  value,
  caption,
  size = 148,
  thickness = 10,
  className,
  trackClassName,
  arcClassName,
  label,
}: RadialGaugeProps) {
  const safe = clampPercent(percent);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (safe / 100) * circumference;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${Math.round(safe)}%`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          className={cn("stroke-current opacity-15", trackClassName)}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          className={cn(
            "stroke-current transition-[stroke-dasharray] duration-500 ease-out motion-reduce:transition-none",
            arcClassName
          )}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl leading-none font-semibold tabular-nums">
          {value ?? `${Math.round(safe)}%`}
        </span>
        {caption ? (
          <span className="mt-1 max-w-[80%] text-xs opacity-70">{caption}</span>
        ) : null}
      </div>
    </div>
  );
}

export { RadialGauge };
