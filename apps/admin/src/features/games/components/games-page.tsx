"use client";

import * as React from "react";
import { formatNumber } from "@moa/app-kit";
import { Button, DataTable, EmptyState, Notice, Skeleton, StatCard, type DataTableColumn } from "@moa/ui";

import { useGamesOverview } from "../queries";
import { connectedNow, gamesOf, type GameRow, type GamesOverview } from "../schemas";

const num = (n: number) => formatNumber(n);

function Totals({ o }: { o: GamesOverview }) {
  const { cards, hunt } = o.totals;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Connected now" value={num(connectedNow(o))} caption="Players active in the last 5 minutes, both games" tone="success" />
        <StatCard label="Events with Hero Cards" value={num(cards.events)} caption={`${num(cards.players)} players`} />
        <StatCard label="Events with Scavenger Hunt" value={num(hunt.events)} caption={`${num(hunt.players)} players`} />
        <StatCard
          label="Clubs with the games"
          value={num(o.plans.reduce((s, p) => s + p.game_cards + p.game_hunt, 0))}
          caption={o.plans.length ? o.plans.map((p) => `${p.plan_name || p.plan_key}: ${p.game_cards}/${p.game_hunt}`).join(" · ") : "Cards / hunt, by plan"}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <section aria-label="Hero Cards totals" className="border-line-soft rounded-2xl border p-4">
          <h2 className="m-0 text-[15px] font-semibold">Hero Cards</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <Fact label="Connected now" value={cards.connected_now} />
            <Fact label="Reveals" value={cards.reveals} />
            <Fact label="Collects" value={cards.collects} />
            <Fact label="Decks completed" value={cards.decks_completed} />
          </dl>
        </section>
        <section aria-label="Scavenger Hunt totals" className="border-line-soft rounded-2xl border p-4">
          <h2 className="m-0 text-[15px] font-semibold">Scavenger Hunt</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <Fact label="Connected now" value={hunt.connected_now} />
            <Fact label="Claims" value={hunt.claims} />
            <Fact label="Hunts completed" value={hunt.hunts_completed} />
            <Fact label="Players" value={hunt.players} />
          </dl>
        </section>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-ink-3 text-xs">{label}</dt>
      <dd className="m-0 text-lg font-semibold tabular-nums">{num(value)}</dd>
    </div>
  );
}

const right = { className: "text-right tabular-nums", headerClassName: "text-right" } as const;

export const COLUMNS: DataTableColumn<GameRow>[] = [
  {
    key: "event",
    header: "Club and event",
    sortValue: (r) => `${r.club_name} ${r.event_name}`.toLowerCase(),
    cell: (r) => (
      <div className="min-w-0">
        <p className="m-0 font-medium">{r.event_name || `Event ${r.event_id}`}</p>
        <p className="text-ink-3 m-0 text-xs">
          {r.club_name || "Unknown club"} · {gamesOf(r)}
        </p>
      </div>
    ),
  },
  { key: "players", header: "Players", sortValue: (r) => r.players, cell: (r) => num(r.players), ...right },
  { key: "now", header: "Connected now", sortValue: (r) => r.connected_now, cell: (r) => num(r.connected_now), ...right },
  { key: "reveals", header: "Reveals", sortValue: (r) => r.reveals, cell: (r) => num(r.reveals), ...right },
  { key: "collects", header: "Collects", sortValue: (r) => r.collects, cell: (r) => num(r.collects), ...right },
  { key: "claims", header: "Hunt claims", sortValue: (r) => r.hunt_claims, cell: (r) => num(r.hunt_claims), ...right },
  { key: "decks", header: "Decks completed", sortValue: (r) => r.decks_completed, cell: (r) => num(r.decks_completed), ...right },
  { key: "hunts", header: "Hunts completed", sortValue: (r) => r.hunts_completed, cell: (r) => num(r.hunts_completed), ...right },
];

/**
 * Admin → Games: how much the two event games are used, platform-wide and
 * per club and event, with a date range (whole days; empty is all time).
 * Read only; "connected now" refreshes while the tab is open.
 */
export function GamesPage() {
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const overview = useGamesOverview({ from, to });
  const o = overview.data;
  const bad = Boolean(from && to && to < from);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-ink-3">From</span>
          <input type="date" aria-label="From" className="input w-auto" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-ink-3">To</span>
          <input type="date" aria-label="To" className="input w-auto" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        {from || to ? (
          <Button variant="ghost" size="sm" onClick={() => (setFrom(""), setTo(""))}>
            All time
          </Button>
        ) : (
          <span className="text-ink-3 pb-2 text-xs">All time</span>
        )}
      </div>
      {bad ? <Notice tone="caution">The end date is before the start date.</Notice> : null}

      {overview.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : overview.isError ? (
        <EmptyState tone="muted" title="Could not load the games numbers" description="Try again in a moment." action={<Button variant="secondary" size="sm" onClick={() => void overview.refetch()}>Try again</Button>} />
      ) : !o ? (
        <EmptyState tone="muted" title="Games are not here yet" description="The numbers show once the API has Hero Cards and the Scavenger Hunt." />
      ) : (
        <>
          <Totals o={o} />
          <section className="flex flex-col gap-2" aria-label="Per club and event">
            <h2 className="m-0 text-base">Per club and event</h2>
            <DataTable columns={COLUMNS} data={o.rows} rowKey={(r) => `${r.event_id}`} emptyMessage="No event has a game switched on in this period." defaultSort={{ key: "players", order: "desc" }} />
          </section>
        </>
      )}
    </div>
  );
}
