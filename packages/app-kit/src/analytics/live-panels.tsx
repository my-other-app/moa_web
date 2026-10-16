"use client";

import * as React from "react";
import Link from "next/link";
import { CardLabel, ProgressBar, cn } from "@moa/ui";

import { pct, plural } from "../format";
import type { AttentionItem, LiveEvent } from "./schemas";

function Shell({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("bg-card ring-border/70 min-w-0 overflow-hidden rounded-2xl shadow-sm ring-1", className)}>{children}</div>;
}

/**
 * What needs a decision, as a list that leads to where the decision is made.
 * Red before amber, nothing more than six: a longer list is a backlog, not a
 * dashboard.
 */
export function AttentionCard({
  items,
  hrefFor,
  allClear,
  className,
}: {
  items: AttentionItem[];
  hrefFor: (item: AttentionItem) => string | null;
  /** The sentence shown when nothing is waiting. */
  allClear: string;
  className?: string;
}) {
  return (
    <Shell className={className}>
      <div className="border-line-soft flex items-center justify-between border-b px-4 py-3">
        <CardLabel>Needs attention</CardLabel>
        <span className="text-ink-3 font-mono text-[11px] tabular-nums">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-ink-3 px-4 py-7 text-center text-[12.5px]">{allClear}</p>
      ) : (
        items.map((a) => {
          const href = hrefFor(a);
          const inner = (
            <>
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", a.tone === "red" ? "bg-refuse" : "bg-caution")} />
                <span className="text-foreground text-[13px] font-medium">{a.title}</span>
              </div>
              <div className="text-ink-3 mt-1 ml-3.5 text-[12.5px] leading-[1.5]">{a.body}</div>
            </>
          );
          const cls = "border-line-soft block w-full border-t px-4 py-3 text-left transition-colors first:border-t-0";
          return href ? (
            <Link key={`${a.kind}-${a.event_id}`} href={href} className={cn(cls, "hover:bg-sunken")}>
              {inner}
            </Link>
          ) : (
            <div key={`${a.kind}-${a.event_id}`} className={cls}>
              {inner}
            </div>
          );
        })
      )}
    </Shell>
  );
}

/**
 * The doors open right now: each live event with its turnout, its gates and
 * who is on them. The counts refresh on their own while the page is open.
 */
export function DoorsOpenCard({
  live,
  eventHref,
  gateHref,
  refreshing,
  showClub,
  emptyBody,
  className,
}: {
  live: LiveEvent[];
  eventHref: (e: LiveEvent) => string;
  /** The gate console for an event; omitted where the viewer cannot run a door. */
  gateHref?: (e: LiveEvent) => string;
  refreshing?: boolean;
  showClub?: boolean;
  emptyBody: string;
  className?: string;
}) {
  return (
    <Shell className={className}>
      <div className="border-line-soft flex items-center justify-between border-b px-4 py-3">
        <CardLabel>Doors open now</CardLabel>
        {live.length ? (
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-admit">
            <span aria-hidden="true" className="size-[5px] rounded-full bg-admit [animation:pulse-ring_2.4s_infinite] motion-reduce:[animation:none]" />
            LIVE
          </span>
        ) : null}
      </div>
      {live.length === 0 ? (
        <p className="text-ink-3 px-4 py-7 text-center text-[12.5px]">{emptyBody}</p>
      ) : (
        live.map((l) => (
          <div key={l.event_id} className="border-line-soft border-t p-4 first:border-t-0">
            <div className="flex items-baseline justify-between gap-2.5">
              <Link href={eventHref(l)} className="text-foreground hover:text-brand min-w-0 truncate text-[15px] font-medium">
                {l.name}
                {showClub && l.club ? <span className="text-ink-3 font-normal"> · {l.club}</span> : null}
              </Link>
              <span className="text-ink-3 shrink-0 font-mono text-[12px] tabular-nums">
                {l.checked_in} / {l.registered}
              </span>
            </div>
            <ProgressBar value={l.checked_in} max={l.registered} className="mt-2.5" label={`${l.name} checked in`} tone="admit" />
            <div className="text-ink-3 mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 font-mono text-[11px] tracking-[0.04em]">
              <span>{pct(l.checked_in, l.registered)}% TURNOUT</span>
              <span className="uppercase">
                {l.gates.length ? l.gates.join(" + ") : "no door yet"} · {plural(l.volunteers, "volunteer")}
                {!l.door_open ? " · door shut" : ""}
              </span>
            </div>
            {gateHref && l.door_open ? (
              <Link href={gateHref(l)} className="text-brand hover:text-foreground mt-2 inline-block text-[12px] font-medium">
                Open gate console →
              </Link>
            ) : null}
          </div>
        ))
      )}
      <div className="border-line-soft text-ink-3 border-t px-4 py-3 text-[12px]">Counts refresh every 15 seconds{refreshing ? " · refreshing" : ""}.</div>
    </Shell>
  );
}
