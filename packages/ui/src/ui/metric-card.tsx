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

function deltaChipClass(delta: MetricDelta): string {
  if (delta.direction === "flat") {
    return "bg-muted text-muted-foreground";
  }
  const good = delta.inverted ? delta.direction === "down" : delta.direction === "up";
  return good
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
    : "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300";
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
        "bg-card ring-border/70 flex min-h-[8.75rem] flex-col gap-3 rounded-2xl p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.10)] ring-1",
        "transition-shadow duration-200 hover:shadow-[0_1px_2px_rgba(16,24,40,0.05),0_12px_32px_-12px_rgba(16,24,40,0.16)] motion-reduce:transition-none",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {icon ? (
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-xl [&_svg]:size-4",
                chipClasses[tone]
              )}
              aria-hidden="true"
            >
              {icon}
            </span>
          ) : null}
          <span className="text-muted-foreground text-[13px] leading-none font-medium">
            {label}
          </span>
        </div>
        {action}
      </div>

      {/*
       * Value, then its context directly beneath it.
       *
       * These used to sit on one baseline at opposite ends of the card, which
       * put a third of the card's width between a number and the words that
       * explain it -- they read as two unrelated facts rather than one.
       */}
      <div className="mt-auto">
        <p className="text-foreground text-[2.125rem] leading-[1.05] font-semibold tracking-[-0.02em] tabular-nums">
          {value}
          {unit ? (
            <span className="text-muted-foreground ml-1 text-base font-medium tracking-normal">
              {unit}
            </span>
          ) : null}
        </p>

        {delta || caption ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
            {delta ? (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold",
                  deltaChipClass(delta)
                )}
              >
                <DeltaIcon direction={delta.direction} />
                {delta.label}
              </span>
            ) : null}
            {caption ? (
              <span className="text-muted-foreground truncate">{caption}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export { MetricCard };
