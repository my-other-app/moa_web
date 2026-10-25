"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AwardIcon, Loader2Icon, PlusIcon, TrophyIcon, XIcon } from "lucide-react";
import { CardLabel, EmptyState, FigurePanel, Notice, Skeleton, cn } from "@moa/ui";

import { useAccess } from "@/features/access";
import { fetchRegistrations } from "@/features/registrations/api";

import { useResults, useSetGuestPlacing, useSetTeamPlacing } from "../queries";
import { PLACES, PLACE_LABEL, type ResultTeam, type ResultTrack, type Winner } from "../schemas";

const MEDAL: Record<number, string> = {
  1: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  2: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  3: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
};

function Medal({ position }: { position: number }) {
  return (
    <span className={cn("inline-grid h-6 min-w-9 place-items-center rounded-full px-2 font-mono text-[11.5px] font-semibold", MEDAL[position] ?? "bg-sunken text-ink-2")}>
      {PLACE_LABEL[position] ?? `#${position}`}
    </span>
  );
}

/** Find a guest on the list by name, email or ticket, and give them the place. */
function GuestPicker({ eventId, position, disabled, onPick }: { eventId: number; position: number; disabled: boolean; onPick: (id: string, name: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const term = search.trim();
  const found = useQuery({
    queryKey: ["results", eventId, "find", term],
    queryFn: () => fetchRegistrations({ eventId, search: term, offset: 0, limit: 8 }),
    enabled: open && term.length >= 2,
    staleTime: 15_000,
  });
  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => setOpen(true)}>
        <PlusIcon className="size-3.5" /> Add a {PLACE_LABEL[position]} place
      </button>
    );
  }
  const rows = found.data?.items ?? [];
  return (
    <div className="grid w-full gap-1.5 sm:max-w-[420px]">
      <div className="flex gap-2">
        <input
          aria-label={`Find a guest for ${PLACE_LABEL[position]} place`}
          className="input h-8 flex-1 text-[12.5px]"
          placeholder="Name, email or ticket"
          value={search}
          autoFocus
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setOpen(false);
            setSearch("");
          }}
        >
          Done
        </button>
      </div>
      {term.length >= 2 ? (
        found.isPending ? (
          <span className="text-ink-3 text-[12px]">Looking…</span>
        ) : rows.length === 0 ? (
          <span className="text-ink-3 text-[12px]">No guest on the list matches “{term}”.</span>
        ) : (
          <ul className="border-line-soft divide-line-soft divide-y rounded-xl border">
            {rows.map((r) => {
              const name = r.full_name || r.name || r.email || "Guest";
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    className="hover:bg-sunken flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[12.5px]"
                    onClick={() => {
                      onPick(r.id, name);
                      setSearch("");
                      setOpen(false);
                    }}
                  >
                    <span className="text-ink truncate">{name}</span>
                    <span className="text-ink-3 truncate font-mono text-[11px]">{r.email ?? r.ticket_id ?? ""}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );
}

/** Guests placed one by one: the event without a competition, or a prize a guest won on their own. */
function GuestPlacings({ eventId, winners, editable }: { eventId: number; winners: Winner[]; editable: boolean }) {
  const set = useSetGuestPlacing(eventId);
  return (
    <FigurePanel className="p-4">
      <CardLabel>Winners</CardLabel>
      <p className="text-ink-3 mt-1 text-[12.5px]">
        Mark who came first, second and third. Joint places are fine — add two guests to the same place.
      </p>
      <div className="mt-3 grid gap-3">
        {PLACES.map((p) => {
          const here = winners.filter((w) => w.position === p);
          return (
            <div key={p} className="flex flex-wrap items-center gap-2" data-testid={`place-${p}`}>
              <Medal position={p} />
              {here.map((w) => (
                <span key={w.registration_id} className="bg-sunken text-ink inline-flex items-center gap-1.5 rounded-full py-1 pr-1.5 pl-3 text-[12.5px]">
                  {w.full_name || w.email || "Guest"}
                  {editable ? (
                    <button
                      type="button"
                      aria-label={`Take ${PLACE_LABEL[p]} place from ${w.full_name || "this guest"}`}
                      className="text-ink-3 hover:text-refuse grid size-5 place-items-center rounded-full"
                      disabled={set.isPending}
                      onClick={() => set.mutate({ registrationId: w.registration_id, position: null, name: w.full_name || "Guest" })}
                    >
                      <XIcon className="size-3" />
                    </button>
                  ) : null}
                </span>
              ))}
              {here.length === 0 && !editable ? <span className="text-ink-3 text-[12.5px]">Nobody yet</span> : null}
              {editable ? (
                <GuestPicker
                  eventId={eventId}
                  position={p}
                  disabled={set.isPending}
                  onPick={(id, name) => set.mutate({ registrationId: id, position: p, name })}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </FigurePanel>
  );
}

function TeamRow({ eventId, team, editable }: { eventId: number; team: ResultTeam; editable: boolean }) {
  const set = useSetTeamPlacing(eventId);
  const pick = (position: number | null) => set.mutate({ teamId: team.id, position, name: team.name });
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="text-ink flex items-center gap-2 text-[13px] font-medium">
          {team.position ? <Medal position={team.position} /> : null}
          {team.name}
        </div>
        <div className="text-ink-3 truncate text-[11.5px]">
          {team.members.length ? team.members.map((m) => m.full_name).join(", ") : "No members yet"}
        </div>
      </div>
      <div role="radiogroup" aria-label={`Placing of ${team.name}`} className="bg-sunken flex rounded-full p-0.5">
        {[null, ...PLACES].map((p) => {
          const on = team.position === p;
          return (
            <button
              key={p ?? "none"}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!editable || set.isPending}
              onClick={() => (on ? undefined : pick(p))}
              className={cn(
                "h-7 min-w-10 rounded-full px-2.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed",
                on ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink",
              )}
            >
              {p === null ? "—" : PLACE_LABEL[p]}
            </button>
          );
        })}
      </div>
    </li>
  );
}

function TrackPanel({ eventId, track, editable }: { eventId: number; track: ResultTrack; editable: boolean }) {
  return (
    <FigurePanel className="p-4">
      <CardLabel>{track.name}</CardLabel>
      {track.teams.length === 0 ? (
        <p className="text-ink-3 mt-2 text-[12.5px]">No teams in this track yet.</p>
      ) : (
        <ul className="divide-line-soft mt-1 divide-y">
          {track.teams.map((t) => (
            <TeamRow key={t.id} eventId={eventId} team={t} editable={editable} />
          ))}
        </ul>
      )}
    </FigurePanel>
  );
}

/**
 * The event's results: who came first, second and third — per competition
 * track, team by team, when the event has a competition, and guest by guest
 * otherwise (or as well). Certificates print the placing, and the winner
 * badges follow from it.
 */
export function ResultsPanel({ eventId }: { eventId: number }) {
  const { can } = useAccess();
  const editable = can.edit_events;
  const q = useResults(eventId);

  if (q.isPending) return <Skeleton className="h-[260px]" />;
  if (q.isError) return <Notice tone="refuse">{q.error instanceof Error ? q.error.message : "Could not read the results."}</Notice>;
  if (q.data === null) return <Notice tone="neutral">Results aren&apos;t available yet. They turn up here once MyOtherApp switches them on.</Notice>;

  const r = q.data;
  const placedByHand = r.winners.filter((w) => w.team_id === null);
  const tracks = r.has_competition ? r.tracks : [];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-ink m-0 flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em]">
            <TrophyIcon className="text-brand size-4" /> Results
          </h2>
          <p className="text-ink-3 mt-1 max-w-[640px] text-[12.5px]">
            Certificates print each guest&apos;s placing (First, Second, Third), and placings earn the winner badges in the app.
          </p>
        </div>
        {r.winners.length ? (
          <span className="text-ink-2 inline-flex items-center gap-1.5 text-[12.5px]">
            <AwardIcon className="size-3.5" /> {r.winners.length} placed
          </span>
        ) : null}
      </div>
      {!editable ? <Notice tone="neutral">Your role can see the results; an editor or admin marks them.</Notice> : null}
      {tracks.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {tracks.map((t) => (
            <TrackPanel key={t.id ?? `none-${t.name}`} eventId={eventId} track={t} editable={editable} />
          ))}
        </div>
      ) : r.has_competition ? (
        <EmptyState tone="muted" title="No teams yet" description="Teams place here, track by track, once they have formed under Competition." />
      ) : null}
      <GuestPlacings eventId={eventId} winners={placedByHand} editable={editable} />
      {q.isFetching ? <Loader2Icon aria-label="Refreshing" className="text-ink-3 size-4 animate-spin" /> : null}
    </div>
  );
}
