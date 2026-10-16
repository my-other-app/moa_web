"use client";

import { formatNumber } from "@moa/app-kit";
import { CardLabel, FigurePanel, RadialGauge, cn } from "@moa/ui";

import type { ReachSummary } from "../insights";

/**
 * How far the club's events travel, and how much of it lands.
 *
 * Page views were recorded and never shown anywhere, so a club could not tell
 * whether a quiet event was unseen or merely unappealing -- which are
 * different problems with different fixes. A panel on the figures grid like
 * any other: the dial is the share of viewers who signed up, and each of the
 * four figures beside it carries the tone it is drawn in elsewhere.
 */
function Figure({
  label,
  value,
  dot,
}: {
  label: string;
  value: string;
  dot: string;
}) {
  return (
    <div className="bg-sunken rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <span
          className={cn("size-1.5 shrink-0 rounded-full", dot)}
          aria-hidden="true"
        />
        <span className="text-ink-3 truncate text-[11.5px]">{label}</span>
      </div>
      <p className="text-ink mt-1 font-mono text-[15px] leading-none font-medium tabular-nums">
        {value}
      </p>
    </div>
  );
}

export function ReachPanel({ reach }: { reach: ReachSummary }) {
  return (
    <FigurePanel className="p-4">
      <CardLabel
        right={
          <span className="text-ink-3 text-[11px]">
            across your most recent events
          </span>
        }
      >
        Reach
      </CardLabel>

      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row xl:flex-col">
        <RadialGauge
          percent={reach.conversionPercent}
          label="Share of people who viewed an event and then registered"
          value={
            reach.views > 0 ? `${Math.round(reach.conversionPercent)}%` : "—"
          }
          caption="view to sign-up"
          size={132}
          thickness={9}
          arcClassName="text-brand"
          trackClassName="text-ink-3"
          className="text-ink shrink-0"
        />

        <div className="grid w-full flex-1 grid-cols-2 gap-2">
          <Figure
            label="Page views"
            value={formatNumber(reach.views)}
            dot="bg-ink-3"
          />
          <Figure
            label="Registrations"
            value={formatNumber(reach.registrations)}
            dot="bg-brand"
          />
          <Figure
            label="Attended"
            value={formatNumber(reach.attended)}
            dot="bg-admit"
          />
          <Figure
            label="Turnout"
            value={
              // Of those who registered for an event that has happened, how
              // many actually came. Upcoming events are excluded, or this
              // reads as a problem that has not had the chance to occur.
              reach.attendancePercent > 0
                ? `${Math.round(reach.attendancePercent)}%`
                : "—"
            }
            dot="bg-info"
          />
        </div>
      </div>
    </FigurePanel>
  );
}
