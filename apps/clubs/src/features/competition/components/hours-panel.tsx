"use client";

import * as React from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { formatTime } from "@moa/app-kit";
import { FigurePanel, IconButton, NativeSelect, cn } from "@moa/ui";

import { useAddMentor, useDeleteMentor, useDeleteSlot, useMakeSlots, usePatchSettings, useSetSlot } from "../queries";
import type { Competition, Mentor } from "../schemas";

/**
 * Mentor office hours: a mentor is a row, a window becomes slots of the
 * set length, and the grid shows every slot free or booked. Teams book
 * from their ticket; the organiser taps a slot to book it for the team
 * chosen above, or to free it.
 */
const toLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

function MentorRow({ eventId, c, m, bookingFor, times }: { eventId: number; c: Competition; m: Mentor; bookingFor: number | null; times: string[] }) {
  const remove = useDeleteMentor(eventId);
  const make = useMakeSlots(eventId);
  const set = useSetSlot(eventId);
  const del = useDeleteSlot(eventId);
  const [opening, setOpening] = React.useState(false);
  const [from, setFrom] = React.useState(() => toLocal(new Date(Math.ceil(Date.now() / 900_000) * 900_000)));
  const [to, setTo] = React.useState(() => toLocal(new Date(Math.ceil(Date.now() / 900_000) * 900_000 + 3_600_000)));
  const byTime = new Map(m.slots.map((s) => [new Date(s.starts_at).getTime(), s]));
  return (
    <>
      <div className="flex items-start gap-2 py-2 pr-2">
        <span className="min-w-0 flex-1">
          <span className="text-ink block truncate text-[13.5px] font-medium">{m.name}</span>
          <span className="text-ink-3 block truncate text-[11.5px]">{m.topic ?? "—"}</span>
          <span className="mt-1 flex items-center gap-1">
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setOpening((o) => !o)}>
              <PlusIcon /> Slots
            </button>
            <IconButton label={`Remove ${m.name}`} variant="quiet" size="xs" danger onClick={() => remove.mutate(m.id)}>
              <Trash2Icon />
            </IconButton>
          </span>
          {opening ? (
            <span className="mt-2 flex flex-wrap items-center gap-1.5">
              <input type="datetime-local" aria-label={`${m.name} slots from`} className="input input-sm w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-ink-3 text-[11px]">to</span>
              <input type="datetime-local" aria-label={`${m.name} slots until`} className="input input-sm w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => { make.mutate({ mentorId: m.id, startsAt: new Date(from).toISOString(), endsAt: new Date(to).toISOString() }); setOpening(false); }} disabled={make.isPending}>
                Open
              </button>
            </span>
          ) : null}
        </span>
      </div>
      {times.map((t) => {
        const slot = byTime.get(Number(t));
        if (!slot)
          return <div key={t} className="border-line-soft m-1 rounded-xl border border-dashed opacity-40" aria-hidden="true" />;
        const booked = slot.team_id !== null;
        return (
          <button
            key={t}
            type="button"
            title={booked ? `${slot.team} · tap to free` : bookingFor ? "Tap to book" : "Free"}
            aria-label={`${m.name} at ${formatTime(slot.starts_at)}: ${booked ? `booked by ${slot.team}` : "free"}`}
            onClick={() => (booked ? set.mutate({ slotId: slot.id, teamId: null }) : bookingFor ? set.mutate({ slotId: slot.id, teamId: bookingFor }) : null)}
            onContextMenu={(e) => { e.preventDefault(); del.mutate(slot.id); }}
            className={cn("m-1 min-h-[52px] rounded-xl border px-2 text-[12.5px] transition-colors", booked ? "border-admit-line bg-admit-soft text-ink" : "border-line-soft text-ink-3 hover:bg-sunken")}
          >
            {booked ? slot.team : "Free"}
          </button>
        );
      })}
    </>
  );
}

export function HoursPanel({ eventId, c }: { eventId: number; c: Competition }) {
  const add = useAddMentor(eventId);
  const settings = usePatchSettings(eventId);
  const [name, setName] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [bookingFor, setBookingFor] = React.useState<number | null>(c.teams[0]?.id ?? null);
  const times = Array.from(new Set(c.mentors.flatMap((m) => m.slots.map((s) => String(new Date(s.starts_at).getTime()))))).sort((a, b) => Number(a) - Number(b));
  const submit = () => {
    if (!name.trim()) return;
    add.mutate({ name: name.trim(), topic: topic.trim() || null });
    setName("");
    setTopic("");
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-ink text-[17px] font-semibold tracking-[-0.01em]">Mentor office hours</h2>
          <p className="text-ink-3 text-[12.5px]">{c.settings.slot_minutes}-minute slots. Teams book from their ticket; tap a slot to book or free it here. Right-click removes a slot.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12.5px]">
            <span className="text-ink-3">Slot</span>
            <NativeSelect aria-label="Slot length" size="sm" className="w-24" value={c.settings.slot_minutes} onChange={(e) => settings.mutate({ slot_minutes: Number(e.target.value) })}>
              {[10, 15, 20, 30, 45, 60].map((n) => (
                <option key={n} value={n}>
                  {n} min
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex items-center gap-1.5 text-[12.5px]">
            <span className="text-ink-3">Booking for</span>
            <NativeSelect aria-label="Booking for" size="sm" className="w-auto min-w-40" value={bookingFor ?? ""} onChange={(e) => setBookingFor(e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {c.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>
      </div>
      <FigurePanel className="p-4">
        <div className="flex flex-wrap items-end gap-2">
          <input className="input input-sm flex-1" placeholder="Mentor's name" aria-label="New mentor" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          <input className="input input-sm flex-1" placeholder="What they help with" aria-label="New mentor topic" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={120} onKeyDown={(e) => (e.key === "Enter" ? (e.preventDefault(), submit()) : null)} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={submit} disabled={!name.trim() || add.isPending}>
            <PlusIcon /> Add mentor
          </button>
        </div>
        {c.mentors.length === 0 ? (
          <p className="text-ink-3 mt-4 text-[12.5px]">Add a mentor, then open a window of slots for them.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <div className="grid min-w-[640px] items-stretch" style={{ gridTemplateColumns: `180px repeat(${Math.max(1, times.length)}, minmax(96px, 1fr))` }}>
              <span />
              {times.length === 0 ? <span className="text-ink-3 px-2 py-2 text-[12px]">No slots yet — open a window for a mentor.</span> : null}
              {times.map((t) => (
                <span key={t} className="text-ink-3 px-2 py-1 text-center font-mono text-[11px]">
                  {formatTime(new Date(Number(t)).toISOString())}
                </span>
              ))}
              {c.mentors.map((m) => (
                <MentorRow key={m.id} eventId={eventId} c={c} m={m} bookingFor={bookingFor} times={times} />
              ))}
            </div>
          </div>
        )}
      </FigurePanel>
    </div>
  );
}
