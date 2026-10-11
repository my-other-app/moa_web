"use client";

import * as React from "react";
import Link from "next/link";
import { ArrivalCurveCard, EventAnalyticsPanels, formatCurrency, formatWindow, pct, relativeTime } from "@moa/app-kit";
import { CardLabel, DefinitionRows, FigurePanel, InitialsAvatar, ProgressBar, RollingNumber, Skeleton, cn } from "@moa/ui";

import type { EventDetail } from "@/features/events";
import { useEventSummary } from "../queries";

const SOURCE_COLOR: Record<string, string> = {
  list: "var(--brand, #17a58f)",
  walkup: "#34d399",
};

/**
 * The at-a-glance figures and the analytics panels, from one summary
 * response. Server figures first, then live every fifteen seconds while
 * the door is open -- the counter rolls, never flashes.
 */
export function EventOverviewTab({ eventId, event }: { eventId: number; event: EventDetail | undefined }) {
  const summary = useEventSummary(eventId);
  const s = summary.data;

  if (summary.isError) {
    return (
      <FigurePanel>
        <CardLabel className="mb-2">Figures</CardLabel>
        <p className="text-muted-foreground text-[12.5px]">The door&apos;s figures could not be loaded. Try reloading the page.</p>
      </FigurePanel>
    );
  }
  if (!s) {
    return (
      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[180px] rounded-2xl" />
        ))}
      </div>
    );
  }

  const deleted = s.retention.state === "deleted";
  const turnout = pct(s.checked_in, s.registered);
  const base = `/events/${eventId}`;
  const mixTotal = Math.max(1, s.by_source.reduce((a, b) => a + b.registered, 0));
  // Each slice starts where the one before it ended: a running total, kept out of render-time mutation.
  const pie = s.by_source
    .filter((b) => b.registered > 0)
    .reduce<{ stops: string[]; at: number }>(
      (acc, b) => ({
        stops: [...acc.stops, `${SOURCE_COLOR[b.source] ?? "#979797"} ${(acc.at / mixTotal) * 100}% ${((acc.at + b.registered) / mixTotal) * 100}%`],
        at: acc.at + b.registered,
      }),
      { stops: [], at: 0 }
    )
    .stops.join(", ");

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(290px,1fr))] gap-3.5">
      <FigurePanel>
        <CardLabel className="mb-3">Arrivals</CardLabel>
        <div className="flex items-baseline gap-2">
          <RollingNumber value={s.checked_in} className="font-mono text-[34px] leading-none tracking-[-0.02em]" />
          <span className="text-muted-foreground font-mono text-[15px]">/ {s.registered}</span>
          <span className="flex-1" />
          <span className="font-mono text-[13px] font-medium text-emerald-500 tabular-nums">{turnout}%</span>
        </div>
        <ProgressBar value={s.checked_in} max={s.registered} tone="admit" height={10} className="mt-3" label="Checked in" />
        <div className="text-muted-foreground mt-2 font-mono text-[11.5px] leading-[1.5] tracking-[0.02em] uppercase">
          {s.capacity ? `Capacity ${s.capacity} · ${Math.max(0, s.capacity - s.checked_in)} places left` : "No capacity set"}
        </div>
        <div className={cn("mt-3 rounded-lg border px-3 py-2.5 text-[12px] leading-[1.5]", deleted ? "border-red-500/40 bg-red-500/10 text-red-500" : "border-border bg-muted/50 text-muted-foreground")}>
          {deleted
            ? "Guest contact details were scrubbed after the closeout report was kept. The report remains."
            : s.retention.mode === "delete"
              ? "Guest contact details are scrubbed after the event ends — the closeout report always goes out first."
              : "Guest data is kept after the event. Retention can be run by hand from Close-out whenever it is time."}
        </div>
        {s.tickets.missing > 0 || s.tickets.pending > 0 || s.tickets.older_design > 0 ? (
          <div className="mt-2 font-mono text-[11px] text-amber-500">
            {[
              s.tickets.missing > 0 ? `${s.tickets.missing} without a ticket` : null,
              s.tickets.pending > 0 ? `${s.tickets.pending} sending` : null,
              s.tickets.older_design > 0 ? `${s.tickets.older_design} on an older design` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            {" · "}
            <Link href={`${base}/attendees`} className="underline-offset-2 hover:underline">
              guest list
            </Link>
          </div>
        ) : null}
      </FigurePanel>

      <FigurePanel>
        <CardLabel className="mb-3">About</CardLabel>
        <p className="text-muted-foreground mb-3 line-clamp-4 text-[13px] leading-[1.55]">{event?.about || "No description yet."}</p>
        <DefinitionRows
          rows={[
            { k: "Club", v: event?.club?.name ?? "—" },
            { k: "Venue", v: event?.is_online ? "Online" : event?.location_name || "—" },
            { k: "Runs", v: formatWindow(s.starts_at, s.ends_at) },
            { k: "Entry", v: event?.has_fee && event.reg_fee ? formatCurrency(event.reg_fee) : "Free" },
            { k: "Capacity", v: s.capacity ? String(s.capacity) : "Unlimited" },
          ]}
        />
      </FigurePanel>

      <FigurePanel className="overflow-hidden p-0">
        <div className="border-border/60 flex items-center justify-between border-b px-4 py-3">
          <CardLabel>Recent check-ins</CardLabel>
          {s.door_open ? (
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-500">
              <span aria-hidden="true" className="size-[5px] rounded-full bg-emerald-500 [animation:pulse-ring_2.4s_infinite] motion-reduce:[animation:none]" />
              LIVE
            </span>
          ) : (
            <span className="text-muted-foreground font-mono text-[10px]">DOOR SHUT</span>
          )}
        </div>
        {s.recent.length === 0 ? (
          <p className="text-muted-foreground px-4 py-7 text-center text-[12.5px]">
            {deleted ? `The ${s.checked_in} admissions live on in the closeout report.` : "Nobody has come through the door yet."}
          </p>
        ) : null}
        {s.recent.map((c) => (
          <div key={c.id} className="border-border/60 flex items-center gap-2.5 border-t px-4 py-2.5 first:border-t-0 [animation:fade-up_220ms_ease-out_both] motion-reduce:[animation:none]">
            <InitialsAvatar name={c.name} size={22} tone="admit" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium">{c.name}</span>
              <span className="text-muted-foreground block font-mono text-[10.5px] uppercase">
                {c.door} · {c.by ?? "—"}
              </span>
            </span>
            <span className="text-muted-foreground font-mono text-[11px]">{relativeTime(c.checked_in_at)}</span>
          </div>
        ))}
        {s.checked_in > 0 ? (
          <Link href={`${base}/check-ins`} className="border-border/60 text-brand hover:bg-muted/50 hover:text-foreground block border-t px-4 py-2.5 text-[12px] font-medium">
            View all {s.checked_in.toLocaleString("en-IN")} check-ins →
          </Link>
        ) : null}
      </FigurePanel>

      <ArrivalCurveCard a={s.analytics} startsAt={s.starts_at} timezone={s.timezone} fromReport={s.from_report} className="col-span-full" />

      <EventAnalyticsPanels
        a={s.analytics}
        timezone={s.timezone}
        fromReport={s.from_report}
        registered={s.registered}
        doorOpen={s.door_open}
        teamHref={`${base}/team`}
        messagesHref={() => `${base}/messages`}
      />

      <FigurePanel>
        <CardLabel className="mb-3">Merchandise collected</CardLabel>
        {s.merch.length === 0 ? (
          <p className="text-muted-foreground py-5 text-center text-[12.5px]">
            No merchandise set up for this event.{" "}
            <Link href={`${base}/merch`} className="text-brand hover:text-foreground">
              Add some
            </Link>
            .
          </p>
        ) : null}
        {s.merch.map((m) => (
          <div key={m.item_id} className="border-border/60 border-t py-2 first:border-t-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12.5px]">{m.name}</span>
              <span className="text-muted-foreground font-mono text-[12px] tabular-nums">
                {m.collected} / {m.total}
              </span>
            </div>
            <ProgressBar value={m.collected} max={m.total} height={8} className="mt-1.5" label={`${m.name} collected`} />
          </div>
        ))}
        {s.merch.length ? (
          <p className="text-muted-foreground mt-2.5 text-[11.5px] leading-[1.5]">Variants are folded into one figure using the same arithmetic as the closeout report, so the two can never disagree.</p>
        ) : null}
      </FigurePanel>

      <FigurePanel>
        <CardLabel className="mb-3">Registration mix</CardLabel>
        {s.by_source.length === 0 ? <p className="text-muted-foreground py-5 text-center text-[12.5px]">No guests on the list yet.</p> : null}
        {s.by_source.length ? (
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative size-[104px] shrink-0 rounded-full" style={{ background: pie ? `conic-gradient(${pie})` : "var(--muted)" }} aria-hidden="true">
              <div className="bg-card absolute inset-[26px] flex flex-col items-center justify-center rounded-full">
                <span className="font-mono text-[17px] tabular-nums">{s.registered}</span>
                <span className="text-muted-foreground font-mono text-[8px] tracking-[0.08em]">ON LIST</span>
              </div>
            </div>
            <ul className="min-w-[130px] flex-1">
              {s.by_source.map((b) => (
                <li key={b.source} className="flex items-center gap-2 py-1.5">
                  <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: SOURCE_COLOR[b.source] ?? "#979797" }} />
                  <span className="flex-1 text-[12.5px]">{b.label}</span>
                  <span className="text-muted-foreground font-mono text-[12px] tabular-nums">
                    {b.checked_in} / {b.registered}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {s.by_source.length ? <p className="text-muted-foreground mt-2.5 text-[11.5px] leading-[1.5]">Checked in over registered, for those who signed up ahead and those registered at the door.</p> : null}
      </FigurePanel>
    </div>
  );
}
