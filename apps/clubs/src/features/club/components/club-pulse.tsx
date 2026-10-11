"use client";

import * as React from "react";
import Link from "next/link";
import { AttentionCard, DoorsOpenCard, attentionPath, timeUntil } from "@moa/app-kit";
import { Skeleton, StatTile } from "@moa/ui";

import { useClubDashboard } from "../queries";

/**
 * The top of the dashboard: four tiles and two cards that read the pulse.
 *
 * Where the club's events stand, how many records it holds, what retention
 * is due, which doors are open; then what needs a decision and the doors
 * open now with their turnout. Every figure comes from one response, so
 * nothing here can describe a different moment from anything else in it.
 */
export function ClubPulse() {
  const q = useClubDashboard();
  const d = q.data;

  if (q.isError) return null;
  if (!d) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[126px] rounded-2xl" />
        ))}
      </div>
    );
  }

  const e = d.stats.events;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile linkAs={Link} label="Events" value={e.total} note={`${e.live} live · ${e.published} published · ${e.draft} draft · ${e.closed} closed`} action={{ label: "Open events", href: "/events" }} />
        <StatTile linkAs={Link} label="On file" value={d.stats.on_file.toLocaleString("en-IN")} note="guest records across open events" action={{ label: "Open events", href: "/events" }} />
        <StatTile
          linkAs={Link}
          label="Retention due"
          value={d.stats.retention_due}
          note={d.stats.next_retention_at ? `next run in ${timeUntil(d.stats.next_retention_at)}` : "nothing scheduled this week"}
          trend={d.stats.retention_due > 0 ? "up" : "none"}
          action={{ label: "Open events", href: "/events?scope=past" }}
        />
        <StatTile
          label="Doors open"
          value={d.stats.doors_open}
          note={d.stats.doors_open === 0 ? "no event is live right now" : d.stats.doors_open === 1 ? "one door admitting guests" : "doors admitting guests"}
          scale={d.stats.doors_open > 0 ? "hero" : "sm"}
        />
      </div>
      <div className="grid gap-3.5 lg:grid-cols-2">
        <AttentionCard items={d.attention} hrefFor={attentionPath} allClear="Nothing is waiting on you. Every open event has its tickets out and a working provider." />
        <DoorsOpenCard
          live={d.live}
          eventHref={(l) => `/events/${l.event_id}`}
          gateHref={(l) => `/gate/${l.event_id}`}
          refreshing={q.isFetching}
          emptyBody="No event is live. The status clock moves an event to Live at its start; Close-out can move it by hand."
        />
      </div>
    </div>
  );
}
