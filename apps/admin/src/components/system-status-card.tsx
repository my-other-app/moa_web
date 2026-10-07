"use client";

import { cn } from "@moa/ui";

/**
 * The "All systems normal" card at the foot of the rail.
 *
 * The design shows live figures -- API latency, payments, last snapshot. None
 * of that is measurable today: there is no health endpoint, no uptime monitor
 * and no error tracking, which is the gap PRODUCTION_READINESS.md opens with.
 *
 * So this states only what it can actually verify, and says the rest is not
 * being watched. A card that claimed "API 182 ms · payments up" without
 * measuring either would be worse than no card: it is the exact reassurance
 * that stops someone checking during an outage.
 */
export function SystemStatusCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-[var(--radius-lg)] p-3.5",
        "bg-[radial-gradient(120%_120%_at_0%_0%,var(--color-section-glow),var(--color-section)_70%)]",
        "shadow-[inset_0_0_0_1px_var(--color-section-ghost)]",
        className
      )}
    >
      <span className="flex items-center gap-2 text-[13px] text-[var(--color-neutral-100)]">
        <span
          aria-hidden="true"
          className="size-2 rounded-full bg-[var(--color-accent-300)] shadow-[0_0_8px_var(--color-accent-300)]"
        />
        Signed in and connected
      </span>
      <span className="text-[11.5px] text-[var(--color-neutral-200)]">
        Uptime and error monitoring are not set up yet — this does not report
        outages.
      </span>
    </div>
  );
}
