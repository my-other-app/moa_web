"use client";

import * as React from "react";
import { EVENT_TIMEZONE, formatNumber, formatTime, pct, plural } from "@moa/app-kit";
import { CardLabel, FigurePanel, cn } from "@moa/ui";
import type { NetworkingHour, NetworkingStats } from "@moa/api";

import { useNetworkingStats } from "../queries";

function Figure({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-ink-3 font-mono text-[10px] tracking-[0.06em] uppercase">{k}</div>
      <div className="text-ink mt-0.5 font-mono text-[20px] leading-tight tracking-[-0.02em] tabular-nums">{v}</div>
      {sub ? <div className="text-ink-3 truncate text-[11px]">{sub}</div> : null}
    </div>
  );
}

/**
 * Saves per hour, as bars in the theme's own tokens (the busiest hour in
 * the brand, the rest in its line tint), so it reads in light and in dark.
 * Its words are on the figure for a screen reader; the hours under it are
 * the first and the last.
 */
function HourBars({ hours, timezone }: { hours: NetworkingHour[]; timezone: string }) {
  const peak = Math.max(1, ...hours.map((h) => h.saves));
  const busiest = hours.reduce((best, h) => (h.saves > best.saves ? h : best), hours[0]!);
  const said = hours.map((h) => `${formatTime(h.hour, timezone)}: ${plural(h.saves, "save")}`).join(", ");
  return (
    <figure className="m-0">
      <div role="img" aria-label={`Saves by hour. ${said}.`} className="flex h-[72px] items-end gap-1">
        {hours.map((h) => (
          <div
            key={h.hour}
            data-hour={h.hour}
            title={`${formatTime(h.hour, timezone)} · ${plural(h.saves, "save")}`}
            className={cn("min-w-[3px] flex-1 rounded-t-[3px]", h === busiest && h.saves > 0 ? "bg-brand" : "bg-brand-line")}
            style={{ height: `${Math.max(h.saves > 0 ? 6 : 2, (h.saves / peak) * 100)}%` }}
          />
        ))}
      </div>
      <figcaption className="text-ink-3 mt-1.5 flex justify-between font-mono text-[10.5px] tabular-nums">
        <span>{formatTime(hours[0]!.hour, timezone)}</span>
        {busiest.saves > 0 ? <span>busiest {formatTime(busiest.hour, timezone)}</span> : null}
        <span>{formatTime(hours[hours.length - 1]!.hour, timezone)}</span>
      </figcaption>
    </figure>
  );
}

/** The card's body, for the figures as they stand. */
export function NetworkingFigures({ stats, timezone = EVENT_TIMEZONE }: { stats: NetworkingStats; timezone?: string }) {
  const hours = stats.by_hour;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure k="Checked in" v={formatNumber(stats.checked_in)} />
        <Figure
          k="Networked"
          v={formatNumber(stats.people_networked)}
          sub={stats.checked_in ? `${pct(stats.people_networked, stats.checked_in)}% of those in` : undefined}
        />
        <Figure k="Saves" v={formatNumber(stats.saves)} />
        <Figure k="Mutual pairs" v={formatNumber(stats.mutual_pairs)} sub="saved each other" />
      </div>
      {stats.saves === 0 ? (
        <p className="text-ink-3 mt-3 text-[12.5px] leading-[1.5]">
          No saves yet. Guests save each other by scanning the personal QR on a badge or in the app.
        </p>
      ) : hours.length ? (
        <div className="border-line-soft mt-3 border-t pt-3">
          <HourBars hours={hours} timezone={timezone} />
        </div>
      ) : null}
    </>
  );
}

/**
 * How much the event's guests met each other: who is in, how many saved
 * someone or were saved, the saves, the pairs who saved each other, and the
 * saves hour by hour. Counts only; who saved whom stays with the guests.
 *
 * Read every minute while the event is live and the tab is visible. Kept
 * off the page when there is nothing to say yet (nobody in, nothing saved),
 * and whenever the API cannot answer (no such route yet, not allowed, the
 * network): the page around it never depends on it.
 */
export function NetworkingCard({
  eventId,
  live,
  timezone = EVENT_TIMEZONE,
  className,
}: {
  eventId: number;
  /** The event is live: the counts are read again every minute. */
  live: boolean;
  timezone?: string;
  className?: string;
}) {
  const q = useNetworkingStats(eventId, live);
  const stats = q.data;
  if (q.isError || !stats) return null;
  if (stats.checked_in === 0 && stats.saves === 0 && stats.people_networked === 0) return null;
  return (
    <FigurePanel role="region" aria-label="Networking" className={className}>
      <CardLabel
        className="mb-3"
        right={live ? <span className="text-ink-3 text-[11px]">Live · every minute</span> : null}
      >
        Networking
      </CardLabel>
      <NetworkingFigures stats={stats} timezone={timezone} />
    </FigurePanel>
  );
}
