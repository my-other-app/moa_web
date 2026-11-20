"use client";

import * as React from "react";
import { formatNumber, plural, relativeTime } from "@moa/app-kit";
import { CardLabel, FigurePanel, ProgressBar, Skeleton, StatTile, cn } from "@moa/ui";

import { useQuestDashboard, useQuestLeaderboard } from "../queries";
import type { QuestAdmin, QuestDashboard } from "../schemas";
import { thresholdText } from "./milestones-panel";

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

function Bars({ rows, of, empty }: { rows: { id: string; label: string; value: number; extra?: string }[]; of: number; empty: string }) {
  if (!rows.length) return <p className="text-ink-3 text-[12.5px]">{empty}</p>;
  return (
    <ul className="grid gap-2.5">
      {rows.map((r) => (
        <li key={r.id}>
          <div className="flex items-baseline gap-2 text-[12.5px]">
            <span className="text-ink min-w-0 flex-1 truncate">{r.label}</span>
            <span className="text-ink font-mono tabular-nums">{formatNumber(r.value)}</span>
            <span className="text-ink-3 w-10 text-right font-mono text-[11px] tabular-nums">{pct(r.value, of)}%</span>
          </div>
          <ProgressBar value={r.value} max={Math.max(of, 1)} height={6} className="mt-1" label={`${r.label}: ${r.value} of ${of}`} />
          {r.extra ? <p className="text-ink-3 mt-0.5 text-[11px]">{r.extra}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function Rewards({ d }: { d: QuestDashboard }) {
  if (!d.rewards.length) return <p className="text-ink-3 text-[12.5px]">No rewards yet.</p>;
  return (
    <table className="w-full text-[12.5px]">
      <thead>
        <tr className="text-ink-3 font-mono text-[10px] tracking-[0.06em] uppercase">
          <th className="py-1.5 text-left font-normal">Reward</th>
          <th className="px-2 py-1.5 text-right font-normal">Unlocked</th>
          <th className="px-2 py-1.5 text-right font-normal">Collected</th>
          <th className="py-1.5 text-right font-normal">Left</th>
        </tr>
      </thead>
      <tbody>
        {d.rewards.map((r) => {
          const unlocked = r.reserved + r.collected + r.waitlisted + r.sold_out;
          const short = r.waitlisted + r.sold_out;
          return (
            <tr key={r.id} className="border-line-soft border-t align-top">
              <td className="py-2">
                <span className="text-ink font-medium">{r.name}</span>
                {short || r.needs_size ? (
                  <span className="text-ink-3 block text-[11px]">
                    {[r.needs_size ? `${r.needs_size} to pick a size` : null, r.waitlisted ? `${r.waitlisted} waiting` : null, r.sold_out ? `${r.sold_out} sold out` : null].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
              </td>
              <td className="text-ink-2 px-2 py-2 text-right font-mono tabular-nums">{formatNumber(unlocked)}</td>
              <td className="text-ink px-2 py-2 text-right font-mono tabular-nums">{formatNumber(r.collected)}</td>
              <td className={cn("py-2 text-right font-mono tabular-nums", r.stock.free === 0 ? "text-caution" : "text-ink")}>
                {formatNumber(r.stock.free)}
                <span className="text-ink-3"> / {formatNumber(r.stock.total)}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Board({ eventId, on, mode, names }: { eventId: number; on: boolean; mode: QuestAdmin["mode"]; names: QuestAdmin["leaderboard_names"] }) {
  const board = useQuestLeaderboard(eventId, on);
  if (!on) return null;
  const rows = board.data?.rows ?? [];
  return (
    <FigurePanel className="p-4">
      <CardLabel right={<span className="text-ink-3 font-mono text-[11px]">{mode === "points" ? "points" : "tasks"}</span>}>Leaderboard</CardLabel>
      {board.isPending ? (
        <Skeleton className="mt-2 h-24" />
      ) : rows.length ? (
        <ol className="mt-2 grid gap-1.5">
          {rows.map((r, i) => (
            <li key={`${r.rank}-${i}`} className="flex items-center gap-2.5 text-[12.5px]">
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold", r.rank <= 3 ? "bg-brand-soft text-brand" : "bg-sunken text-ink-2")}>{r.rank}</span>
              <span className="text-ink min-w-0 flex-1 truncate">{r.name}</span>
              <span className="text-ink font-mono tabular-nums">{formatNumber(r.score)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-ink-3 mt-2 text-[12.5px]">Nobody has scored yet.</p>
      )}
      <p className="text-ink-3 mt-2 text-[11px]">Full names here; guests see {names === "full" ? "full names too" : "first names and an initial"}.</p>
    </FigurePanel>
  );
}

/**
 * The event day's view, read again every 15 seconds: how many are playing,
 * how many did each task and reached each milestone, rewards unlocked
 * against collected with the stock left, station visits, what just
 * happened, and the leaderboard when it is on. Counts only, no contacts.
 */
export function LivePanel({ eventId, q }: { eventId: number; q: QuestAdmin }) {
  const dash = useQuestDashboard(eventId);
  const d = dash.data;
  if (dash.isPending) return <Skeleton className="h-[260px] rounded-2xl" />;
  if (!d) return null;
  const unlocked = d.rewards.reduce((s, r) => s + r.reserved + r.collected + r.waitlisted + r.sold_out, 0);
  const collected = d.rewards.reduce((s, r) => s + r.collected, 0);
  const free = d.rewards.reduce((s, r) => s + r.stock.free, 0);
  const total = d.rewards.reduce((s, r) => s + r.stock.total, 0);
  const visits = d.stations.filter((s) => s.purpose !== "swag_desk").reduce((s, x) => s + x.visits, 0);
  const of = Math.max(d.participants, 1);
  return (
    <section aria-label="Live numbers" className="flex flex-col gap-3.5">
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Taking part" value={formatNumber(d.participants)} note={`${plural(d.checked_in, "guest")} checked in at the event`} scale="hero" />
        <StatTile label="Rewards unlocked" value={formatNumber(unlocked)} note={`${formatNumber(collected)} collected · ${formatNumber(Math.max(unlocked - collected, 0))} still to collect`} />
        <StatTile label="Stock left" value={formatNumber(free)} note={total ? `of ${formatNumber(total)} across the rewards` : "no rewards yet"} />
        <StatTile label="Station visits" value={formatNumber(visits)} note={plural(d.stations.filter((s) => s.purpose !== "swag_desk").length, "station")} />
      </div>
      <div className="grid items-start gap-3.5 lg:grid-cols-2">
        <FigurePanel className="p-4">
          <CardLabel right={<span className="text-ink-3 font-mono text-[11px]">done · of those taking part</span>}>Tasks</CardLabel>
          <div className="mt-2.5">
            <Bars
              of={of}
              empty="No tasks yet."
              rows={d.tasks.map((t) => ({ id: t.id, label: t.title, value: t.done, extra: t.in_progress ? `${formatNumber(t.in_progress)} on their way` : undefined }))}
            />
          </div>
        </FigurePanel>
        <div className="grid gap-3.5">
          <FigurePanel className="p-4">
            <CardLabel>Milestones</CardLabel>
            <div className="mt-2.5">
              <Bars
                of={of}
                empty="No milestones yet."
                rows={d.milestones.map((m) => ({ id: m.id, label: `${m.title} · at ${thresholdText(q, m.threshold)}`, value: m.unlocked }))}
              />
            </div>
          </FigurePanel>
          <FigurePanel className="p-4">
            <CardLabel>Rewards</CardLabel>
            <div className="mt-1">
              <Rewards d={d} />
            </div>
          </FigurePanel>
        </div>
      </div>
      <div className="grid items-start gap-3.5 lg:grid-cols-2">
        <FigurePanel className="p-4">
          <CardLabel right={d.computed_at ? <span className="text-ink-3 font-mono text-[11px]">as of {relativeTime(d.computed_at)}</span> : null}>Just now</CardLabel>
          {d.recent.length ? (
            <ul className="mt-2 grid gap-1.5">
              {d.recent.slice(0, 10).map((r, i) => (
                <li key={`${r.at}-${i}`} className="flex items-baseline gap-2 text-[12.5px]">
                  <span className="text-ink-3 w-16 shrink-0 font-mono text-[11px]">{relativeTime(r.at)}</span>
                  <span className="text-ink min-w-0 flex-1">
                    <span className="font-medium">{r.name}</span> {r.what}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-3 mt-2 text-[12.5px]">Unlocks and handovers show here as they happen.</p>
          )}
          {d.stations.length ? (
            <dl className="border-line-soft mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-t pt-2.5 text-[12.5px]">
              {d.stations.map((s) => (
                <React.Fragment key={s.door_id || s.name}>
                  <dt className="text-ink-2 truncate">
                    {s.name}
                    {s.purpose === "swag_desk" ? <span className="text-ink-3"> · swag desk</span> : null}
                  </dt>
                  <dd className="text-ink m-0 text-right font-mono tabular-nums">{s.purpose === "swag_desk" ? "—" : formatNumber(s.visits)}</dd>
                </React.Fragment>
              ))}
            </dl>
          ) : null}
        </FigurePanel>
        <Board eventId={eventId} on={q.leaderboard} mode={q.mode} names={q.leaderboard_names} />
      </div>
    </section>
  );
}
