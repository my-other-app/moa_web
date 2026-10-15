"use client";

import * as React from "react";
import { cn } from "@moa/ui";

/**
 * The admin's surface vocabulary, on Meridian.
 *
 * Four shapes the screens repeat: a panel (a sheet on the canvas), its
 * title row, a row with a faded rule, and a segmented control. They read
 * the same tokens the clubs dashboard reads, so the two apps cannot drift.
 */
export function Panel({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("bg-surface border-line-soft shadow-card flex flex-col gap-3 rounded-[var(--radius-card)] border p-[18px]", className)} {...props}>
      {children}
    </div>
  );
}

export function PanelTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="text-ink text-[14.5px] font-semibold tracking-[-0.01em]">{children}</span>
      {aside ? <span className="text-ink-3 font-mono text-[11px]">{aside}</span> : null}
    </div>
  );
}

/** A row whose bottom rule fades to transparent 48px from each end. */
export function RuleRow({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("rule-fade py-2", className)} {...props}>
      {children}
    </div>
  );
}

export function Micro({ children }: { children: React.ReactNode }) {
  return <span className="eyebrow">{children}</span>;
}

/**
 * A segmented control, generic over the option value so a caller cannot
 * pass a key the handler does not accept.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; icon?: React.ReactNode }>;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("bg-sunken inline-flex w-fit gap-0.5 rounded-full p-1", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] whitespace-nowrap transition-colors",
              active ? "bg-surface text-ink shadow-card font-medium" : "text-ink-2 hover:text-ink"
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A horizontal proportion bar — the breakdown and composition rows. */
export function Meter({ value, max, tone = "accent" }: { value: number; max: number; tone?: "accent" | "muted" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="bg-sunken h-1.5 rounded-[3px]">
      <div className={cn("h-full rounded-[3px]", tone === "accent" ? "bg-brand" : "bg-ink-3")} style={{ width: `${pct}%` }} />
    </div>
  );
}
