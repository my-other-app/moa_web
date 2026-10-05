import * as React from "react";
import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from "lucide-react";

import { cn } from "../lib/cn";

/**
 * A headline figure with its direction and the context needed to read it.
 *
 * `StatCard` shows a number and an optional caption, which answers "how many"
 * and nothing else. Every number on an operations dashboard raises two further
 * questions immediately -- which way is it moving, and against what -- so those
 * are part of the component rather than something each caller re-invents in a
 * `<p>` underneath.
 */
export type MetricTone =
  | "default"
  | "brand"
  | "success"
  | "warning"
  | "destructive"
  | "info";

const chipClasses: Record<MetricTone, string> = {
  default: "bg-secondary text-secondary-foreground",
  brand: "bg-brand/10 text-brand",
  success:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  destructive: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
};

export type DeltaDirection = "up" | "down" | "flat";

export interface MetricDelta {
  /** Already formatted -- "+12%", "new", "flat". */
  label: string;
  direction: DeltaDirection;
  /**
   * Set when rising is the bad outcome (refunds, failures, pending approvals).
   * Colour follows good/bad, not up/down: an arrow that is green because a
   * number went up is actively misleading when that number is failed payments.
   */
  inverted?: boolean;
}

function deltaToneClass(delta: MetricDelta): string {
  if (delta.direction === "flat") return "text-muted-foreground";
  const good = delta.inverted ? delta.direction === "down" : delta.direction === "up";
  return good ? "text-emerald-600 dark:text-emerald-400" : "text-destructive";
}

function DeltaIcon({ direction }: { direction: DeltaDirection }) {
  const Icon =
    direction === "up"
      ? ArrowUpRightIcon
      : direction === "down"
        ? ArrowDownRightIcon
        : MinusIcon;
  return <Icon className="size-3.5 shrink-0" aria-hidden="true" />;
}

export interface MetricCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Rendered smaller and lighter beside the value, e.g. "%" or "INR". */
  unit?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: MetricTone;
  delta?: MetricDelta | null;
  /** What the delta is measured against, e.g. "vs previous 30 days". */
  caption?: React.ReactNode;
  /** Menu or link rendered top-right. */
  action?: React.ReactNode;
  className?: string;
}

function MetricCard({
  label,
  value,
  unit,
  icon,
  tone = "default",
  delta,
  caption,
  action,
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "bg-card flex min-h-[8.5rem] flex-col justify-between rounded-xl border p-4",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon ? (
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-lg [&_svg]:size-4",
                chipClasses[tone]
              )}
              aria-hidden="true"
            >
              {icon}
            </span>
          ) : null}
          <span className="text-muted-foreground text-sm font-medium">{label}</span>
        </div>
        {action}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-foreground text-[2rem] leading-none font-semibold tracking-tight tabular-nums">
          {value}
          {unit ? (
            <span className="text-muted-foreground ml-0.5 text-lg font-medium">
              {unit}
            </span>
          ) : null}
        </p>

        <div className="flex items-center gap-1.5 text-xs">
          {delta ? (
            <span
              className={cn(
                "flex items-center gap-0.5 font-medium",
                deltaToneClass(delta)
              )}
            >
              <DeltaIcon direction={delta.direction} />
              {delta.label}
            </span>
          ) : null}
          {caption ? (
            <span className="text-muted-foreground">{caption}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export { MetricCard };
