"use client";

import * as React from "react";
import { cn } from "@moa/ui";

/**
 * The v2 surface vocabulary, in one place.
 *
 * These are four shapes the Overview repeats a dozen times between them. They
 * live here rather than in @moa/ui because they encode this theme's specific
 * decisions -- the faded rule, the lime-on-teal band -- which the clubs app
 * does not share yet.
 */
export function Panel({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--color-surface)] p-[18px] shadow-[var(--shadow-sm)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function PanelTitle({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="text-[15px]">{children}</span>
      {aside ? (
        <span className="text-[12px] text-[var(--color-neutral-500)]">{aside}</span>
      ) : null}
    </div>
  );
}

/** A row whose bottom rule fades to transparent 48px from each end. */
export function RuleRow({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("rule-fade py-2", className)} {...props}>
      {children}
    </div>
  );
}

export function Micro({ children }: { children: React.ReactNode }) {
  return <span className="micro">{children}</span>;
}

/**
 * A segmented control.
 *
 * Generic over the option value so a caller cannot pass a key the handler does
 * not accept -- these drive period, sort and view switches across the screen.
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
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex w-fit gap-0.5 rounded-[999px] bg-[var(--color-neutral-900)] p-1",
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-[999px] px-3 py-1 text-[13px] whitespace-nowrap transition-colors",
              active
                ? "bg-[var(--color-accent-900)] text-[var(--color-accent-200)]"
                : "text-[var(--color-neutral-300)] hover:text-[var(--color-text)]"
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
export function Meter({
  value,
  max,
  tone = "accent",
}: {
  value: number;
  max: number;
  tone?: "accent" | "muted";
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 rounded-[3px] bg-[var(--color-neutral-900)]">
      <div
        className={cn(
          "h-full rounded-[3px]",
          tone === "accent"
            ? "bg-[var(--color-accent-500)]"
            : "bg-[var(--color-neutral-600)]"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
