"use client";

import { formatNumber } from "@moa/app-kit";
import { RadialGauge, cn } from "@moa/ui";
import { hoverLift } from "@moa/ui/motion";

import type { ReachSummary } from "../insights";

/**
 * How far the club's events travel, and how much of it lands.
 *
 * Page views were recorded and never shown anywhere, so a club could not tell
 * whether a quiet event was unseen or merely unappealing -- which are
 * different problems with different fixes.
 */
function Figure({ label, value, dotClass }: { label: string; value: string; dotClass: string }) {
  return (
    <div className="rounded-xl bg-white/[0.08] px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <span className={cn("size-1.5 rounded-full", dotClass)} aria-hidden="true" />
        <span className="text-xs opacity-80">{label}</span>
      </div>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function ReachPanel({ reach }: { reach: ReachSummary }) {
  return (
    /*
     * The v2 "presence" band, not a brand fill. `bg-primary` filled this with
     * solid accent teal: fine on the old light ground, a glaring block on a
     * dark one -- and the system's rule is that the accent outlines, never
     * fills. These are the section tokens the admin Overview's stat strip
     * uses, so the two dashboards' one saturated panel matches.
     */
    <div
      className={cn(
        "rounded-[var(--radius-lg)] p-5 text-[var(--color-neutral-100)]",
        "bg-[radial-gradient(90%_140%_at_0%_0%,var(--color-section-glow),var(--color-section)_60%)]",
        hoverLift
      )}
    >
      <div>
        <h3 className="text-sm font-semibold">Reach</h3>
        <p className="text-xs opacity-70">
          Across your most recent events.
        </p>
      </div>

      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row xl:flex-col">
        <RadialGauge
          percent={reach.conversionPercent}
          label="Share of people who viewed an event and then registered"
          value={
            reach.views > 0 ? `${Math.round(reach.conversionPercent)}%` : "--"
          }
          caption="view to sign-up"
          size={132}
          thickness={9}
          arcClassName="text-white"
          trackClassName="text-white"
          className="shrink-0"
        />

        <div className="grid w-full flex-1 grid-cols-2 gap-2">
          <Figure
            label="Page views"
            value={formatNumber(reach.views)}
            dotClass="bg-white"
          />
          <Figure
            label="Registrations"
            value={formatNumber(reach.registrations)}
            dotClass="bg-emerald-300"
          />
          <Figure
            label="Attended"
            value={formatNumber(reach.attended)}
            dotClass="bg-amber-300"
          />
          <Figure
            label="Turnout"
            value={
              // Of those who registered for an event that has happened, how
              // many actually came. Upcoming events are excluded, or this
              // reads as a problem that has not had the chance to occur.
              reach.attendancePercent > 0
                ? `${Math.round(reach.attendancePercent)}%`
                : "--"
            }
            dotClass="bg-sky-300"
          />
        </div>
      </div>
    </div>
  );
}
