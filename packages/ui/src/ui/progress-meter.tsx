import * as React from "react";

import { cn } from "../lib/cn";
import { toPercent } from "./radial-gauge";

/**
 * A quantity against its capacity, with both captions on one line.
 *
 * The pattern is deliberately the same everywhere it appears -- what you have
 * on the left, how long it lasts on the right, the bar underneath -- so a row
 * can be read without re-reading the labels.
 */
export type MeterTone = "brand" | "success" | "warning" | "destructive" | "neutral";

const fillClasses: Record<MeterTone, string> = {
  brand: "bg-brand",
  success: "bg-emerald-500",
  warning: "bg-amber-400",
  destructive: "bg-red-500",
  neutral: "bg-muted-foreground/40",
};

export interface ProgressMeterProps {
  value: number;
  total: number;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  tone?: MeterTone;
  className?: string;
  label?: string;
}

function ProgressMeter({
  value,
  total,
  leading,
  trailing,
  tone = "brand",
  className,
  label,
}: ProgressMeterProps) {
  const percent = toPercent(value, total);

  return (
    <div className={cn("space-y-2", className)}>
      {leading || trailing ? (
        <div className="flex items-baseline justify-between gap-2 text-[13px]">
          <span className="text-foreground truncate font-semibold">{leading}</span>
          <span className="text-muted-foreground shrink-0 text-xs">{trailing}</span>
        </div>
      ) : null}
      <div
        className="bg-muted/80 h-2 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <span
          style={{ width: `${percent}%` }}
          className={cn(
            "block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none",
            fillClasses[tone]
          )}
        />
      </div>
    </div>
  );
}

export { ProgressMeter };
