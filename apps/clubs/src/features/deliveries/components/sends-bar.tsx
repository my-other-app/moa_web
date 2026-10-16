"use client";

import { cn } from "@moa/ui";

import type { TallyFigures } from "../schemas";

/**
 * Where a kind's sends ended up, as one bar on the sunken track: delivered,
 * still waiting for the provider to report, did not arrive, could not be
 * sent, still sending, and (for tickets and certificates) not sent at all.
 * The tones are the four the theme gives meaning to, so a red sliver is a
 * bounce in both modes.
 */
const SEGMENTS = [
  { key: "delivered", label: "delivered", fill: "bg-admit" },
  { key: "awaiting", label: "awaiting a report", fill: "bg-info" },
  { key: "pending", label: "sending", fill: "bg-ink-3" },
  { key: "didntArrive", label: "did not arrive", fill: "bg-refuse" },
  { key: "notSent", label: "could not be sent", fill: "bg-caution" },
  { key: "unsent", label: "not sent yet", fill: "bg-line" },
] as const;

export function SendsBar({
  f,
  unsent = 0,
  label,
  className,
}: {
  f: TallyFigures;
  unsent?: number;
  /** What the bar is of: "Tickets". */
  label: string;
  className?: string;
}) {
  const values: Record<(typeof SEGMENTS)[number]["key"], number> = {
    delivered: f.delivered,
    awaiting: f.awaiting,
    pending: f.pending,
    didntArrive: f.didntArrive,
    notSent: f.notSent,
    unsent,
  };
  const total = SEGMENTS.reduce((n, s) => n + values[s.key], 0);
  const drawn = SEGMENTS.filter((s) => values[s.key] > 0);
  return (
    <div
      role="img"
      aria-label={
        total === 0
          ? `${label}: nothing sent`
          : `${label}: ${drawn.map((s) => `${values[s.key]} ${s.label}`).join(", ")}`
      }
      className={cn(
        "bg-sunken flex h-2 w-full gap-0.5 overflow-hidden rounded-full",
        className,
      )}
    >
      {drawn.map((s) => (
        <span
          key={s.key}
          style={{ width: `${(100 * values[s.key]) / total}%` }}
          className={cn("h-full min-w-[3px] rounded-full", s.fill)}
        />
      ))}
    </div>
  );
}
