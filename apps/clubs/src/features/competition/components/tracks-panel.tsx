"use client";

import * as React from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { EmptyState, FigurePanel, IconButton, cn } from "@moa/ui";

import { useAddTrack, useDeleteTrack, usePatchTrack } from "../queries";
import type { Competition, Track } from "../schemas";

/**
 * Problem statements and tracks. Each is a card edited in place — name,
 * brief, sponsor, prize — saved on blur, with how many teams picked it.
 * Teams pick one when they register their project; a removed track
 * leaves its teams without one, never without a team.
 */
const field = "input w-full";

type Draft = { name: string; description: string; sponsor: string; prize: string };
const draftOf = (t?: Track): Draft => ({ name: t?.name ?? "", description: t?.description ?? "", sponsor: t?.sponsor ?? "", prize: t?.prize ?? "" });
const bodyOf = (d: Draft) => ({ name: d.name.trim(), description: d.description.trim() || null, sponsor: d.sponsor.trim() || null, prize: d.prize.trim() || null });

function TrackCard({ eventId, track }: { eventId: number; track: Track }) {
  const patch = usePatchTrack(eventId);
  const remove = useDeleteTrack(eventId);
  const [d, setD] = React.useState<Draft>(() => draftOf(track));
  const [confirm, setConfirm] = React.useState(false);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD((x) => ({ ...x, [k]: e.target.value }));
  const save = () => {
    const was = draftOf(track);
    if ((Object.keys(d) as (keyof Draft)[]).every((k) => d[k] === was[k])) return;
    if (!d.name.trim()) return setD(was);
    patch.mutate({ id: track.id, body: bodyOf(d) });
  };
  return (
    <FigurePanel className="flex flex-col gap-2.5 p-4">
      <input aria-label={`${track.name} name`} className={cn(field, "text-[14px] font-semibold")} value={d.name} onChange={set("name")} onBlur={save} maxLength={120} />
      <textarea aria-label={`${track.name} brief`} className="input min-h-[72px] py-2 text-[12.5px]" value={d.description} onChange={set("description")} onBlur={save} maxLength={600} placeholder="The problem in two lines: what to build, what counts." />
      <div className="grid grid-cols-2 gap-2">
        <input aria-label={`${track.name} sponsor`} className={cn(field, "input-sm")} value={d.sponsor} onChange={set("sponsor")} onBlur={save} maxLength={120} placeholder="Sponsored by" />
        <input aria-label={`${track.name} prize`} className={cn(field, "input-sm")} value={d.prize} onChange={set("prize")} onBlur={save} maxLength={120} placeholder="Track prize" />
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-ink-3 text-[12px]">
          {track.teams} {track.teams === 1 ? "team" : "teams"} on this track
        </span>
        {confirm ? (
          <button type="button" className="btn btn-secondary btn-xs btn-round btn-danger" onClick={() => remove.mutate(track.id)}>
            Remove track?
          </button>
        ) : (
          <IconButton label={`Remove ${track.name}`} variant="quiet" size="xs" danger onClick={() => setConfirm(true)}>
            <Trash2Icon />
          </IconButton>
        )}
      </div>
    </FigurePanel>
  );
}

export function TracksPanel({ eventId, c }: { eventId: number; c: Competition }) {
  const add = useAddTrack(eventId);
  const [adding, setAdding] = React.useState(false);
  const [d, setD] = React.useState<Draft>(() => draftOf());
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD((x) => ({ ...x, [k]: e.target.value }));
  const submit = async () => {
    if (!d.name.trim()) return;
    await add.mutateAsync(bodyOf(d));
    setD(draftOf());
    setAdding(false);
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-ink text-[17px] font-semibold tracking-[-0.01em]">Problem statements and tracks</h2>
          <p className="text-ink-3 text-[12.5px]">Teams pick one when they register their project. Leave none for an open brief.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          <PlusIcon /> Add track
        </button>
      </div>
      {c.tracks.length === 0 && !adding ? (
        <EmptyState icon={<FlagMark />} title="No tracks yet" description="A track is a problem statement teams choose: a name, a brief, a sponsor, a prize. Without one, every team is on an open brief." action={<button type="button" className="btn btn-primary" onClick={() => setAdding(true)}><PlusIcon /> Add the first track</button>} />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {c.tracks.map((t) => (
          <TrackCard key={t.id} eventId={eventId} track={t} />
        ))}
        {adding ? (
          <FigurePanel className="border-brand-line flex flex-col gap-2.5 p-4">
            <input aria-label="New track name" className={cn(field, "text-[14px] font-semibold")} value={d.name} onChange={set("name")} maxLength={120} placeholder="Track name" autoFocus />
            <textarea aria-label="New track brief" className="input min-h-[72px] py-2 text-[12.5px]" value={d.description} onChange={set("description")} maxLength={600} placeholder="The problem in two lines: what to build, what counts." />
            <div className="grid grid-cols-2 gap-2">
              <input aria-label="New track sponsor" className={cn(field, "input-sm")} value={d.sponsor} onChange={set("sponsor")} maxLength={120} placeholder="Sponsored by" />
              <input aria-label="New track prize" className={cn(field, "input-sm")} value={d.prize} onChange={set("prize")} maxLength={120} placeholder="Track prize" />
            </div>
            <div className="mt-1 flex items-center justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setD(draftOf()); }}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void submit()} disabled={add.isPending || !d.name.trim()}>
                Save track
              </button>
            </div>
          </FigurePanel>
        ) : null}
      </div>
    </div>
  );
}

function FlagMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 22V4a1 1 0 0 1 1-1h11l-2 4 2 4H5" />
    </svg>
  );
}
