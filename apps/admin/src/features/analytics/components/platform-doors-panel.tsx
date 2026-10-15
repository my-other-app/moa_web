"use client";

import * as React from "react";
import Link from "next/link";
import { AttentionCard, DoorsOpenCard, timeUntil } from "@moa/app-kit";
import { Skeleton, StatTile } from "@moa/ui";

import { usePlatformDoors } from "../queries";

/**
 * The platform's doors, on the admin overview: how many are open, what
 * retention is due, what needs a decision anywhere, and every live event
 * with its turnout. An admin cannot run a door, so there is no gate link.
 */
export function PlatformDoorsPanel() {
  const q = usePlatformDoors();
  const d = q.data;
  if (q.isError) return null;
  if (!d) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-[220px] rounded-[var(--radius-card)]" />
        <Skeleton className="h-[220px] rounded-[var(--radius-card)]" />
      </div>
    );
  }
  const e = d.stats.events;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Doors open" value={d.stats.doors_open} note={d.clubs_live ? `across ${d.clubs_live} ${d.clubs_live === 1 ? "club" : "clubs"}` : "no event is live right now"} scale={d.stats.doors_open > 0 ? "hero" : "sm"} />
        <StatTile linkAs={Link} label="Events" value={e.total} note={`${e.live} live · ${e.published} published · ${e.draft} draft · ${e.closed} closed`} action={{ label: "Open events", href: "/events" }} />
        <StatTile linkAs={Link} label="On file" value={d.stats.on_file.toLocaleString("en-IN")} note="guest records across open events" action={{ label: "Open events", href: "/events" }} />
        <StatTile label="Retention due" value={d.stats.retention_due} note={d.stats.next_retention_at ? `next run in ${timeUntil(d.stats.next_retention_at)}` : "nothing scheduled this week"} trend={d.stats.retention_due > 0 ? "up" : "none"} />
      </div>
      <div className="grid gap-3.5 lg:grid-cols-2">
        <AttentionCard
          items={d.attention}
          hrefFor={(a) => (a.event_id === null ? null : `/events/${a.event_id}`)}
          allClear="Nothing is waiting on anyone. Every open event has its tickets out and a working provider."
        />
        <DoorsOpenCard live={d.live} eventHref={(l) => `/events/${l.event_id}`} showClub refreshing={q.isFetching} emptyBody="No event is live anywhere on the platform right now." />
      </div>
    </div>
  );
}
