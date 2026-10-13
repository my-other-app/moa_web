"use client";

import * as React from "react";
import { CalendarClockIcon, DoorOpenIcon, MegaphoneIcon, RadioIcon } from "lucide-react";
import { EVENT_TIMEZONE, formatTime, relativeTime } from "@moa/app-kit";
import { Button, CardLabel, EmptyState, FigurePanel, Chip, Skeleton, cn } from "@moa/ui";

import { agendaTime, useAgenda } from "@/features/agenda";

import { useUpdateMutations, useUpdates } from "../queries";
import { AUDIENCE_LABEL, UPDATE_KINDS, type LiveUpdate } from "../schemas";

/**
 * Live updates: a line pushed to phones and shown as a banner on the event
 * page. Beside it, the run of show — shifting a block moves everything after
 * it and sends the update by itself.
 */
const ICON: Record<LiveUpdate["kind"], React.ReactNode> = { schedule: <CalendarClockIcon className="size-4" />, room: <DoorOpenIcon className="size-4" />, general: <MegaphoneIcon className="size-4" /> };
const KIND_LABEL: Record<LiveUpdate["kind"], string> = { schedule: "Schedule change", room: "Room change", general: "General" };

export function UpdatesPanel({ eventId }: { eventId: number }) {
  const page = useUpdates(eventId);
  const agenda = useAgenda(eventId);
  const { push, shift } = useUpdateMutations(eventId);
  const [kind, setKind] = React.useState<LiveUpdate["kind"]>("schedule");
  const [text, setText] = React.useState("");
  const [audience, setAudience] = React.useState<LiveUpdate["audience"]>("checked_in");
  const [error, setError] = React.useState<string | null>(null);
  if (page.isPending) return <Skeleton className="h-72" />;
  if (page.isError || !page.data) return <EmptyState tone="muted" title="Updates could not load" description="Try again in a moment." />;
  const counts = page.data.audience;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim().length < 3) return setError("Say what changed.");
    setError(null);
    await push.mutateAsync({ kind, text: text.trim(), audience });
    setText("");
  };
  const items = agenda.data?.items ?? [];
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <FigurePanel className="p-5">
          <form onSubmit={submit} noValidate>
            <h2 className="text-ink text-[16px] font-semibold">Push a live update</h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {UPDATE_KINDS.map((k) => (
                <Chip key={k.value} active={kind === k.value} onClick={() => setKind(k.value)}>
                  {k.label}
                </Chip>
              ))}
            </div>
            <textarea className="input mt-3 min-h-[96px] w-full py-2" value={text} maxLength={500} placeholder={UPDATE_KINDS.find((k) => k.value === kind)?.placeholder} aria-label="The update" onChange={(e) => setText(e.target.value)} />
            <select className="input mt-3 h-9 w-full" value={audience} aria-label="Who gets it" onChange={(e) => setAudience(e.target.value as LiveUpdate["audience"])}>
              <option value="checked_in">
                {AUDIENCE_LABEL.checked_in} · {counts.checked_in}
              </option>
              <option value="registered">
                {AUDIENCE_LABEL.registered} · {counts.registered}
              </option>
            </select>
            {error ? <p className="text-refuse mt-2 text-[12px]">{error}</p> : null}
            <div className="mt-3 flex items-center gap-3">
              <Button type="submit" disabled={push.isPending}>
                <RadioIcon className="size-4" /> {push.isPending ? "Pushing…" : "Push now"}
              </Button>
            </div>
            <p className="text-ink-3 mt-3 text-[12px]">Appears as a banner on the event page and a phone notification.</p>
          </form>
        </FigurePanel>

        <FigurePanel className="p-5">
          <CardLabel right={<span className="text-ink-3 text-[11px]">Shifting a slot pushes an update</span>}>Schedule</CardLabel>
          {items.length === 0 ? (
            <p className="text-ink-3 mt-3 text-[12.5px]">No run of show yet. Add blocks under Agenda and shift them from here on the night.</p>
          ) : (
            <ul className="mt-3 grid gap-1">
              {items.map((it) => (
                <li key={it.id} className="hover:bg-sunken flex items-center gap-3 rounded-lg px-2 py-2">
                  <span className="text-ink-2 w-[64px] shrink-0 font-mono text-[12px] tabular-nums">{agendaTime(it.starts_at, EVENT_TIMEZONE)}</span>
                  <span className="text-ink min-w-0 flex-1 truncate text-[13px]">{it.title}</span>
                  <button type="button" className="text-brand font-mono text-[11px] hover:underline disabled:opacity-50" onClick={() => shift.mutate({ itemId: it.id, minutes: 10 })} disabled={shift.isPending} aria-label={`Push ${it.title} and everything after it by ten minutes`}>
                    +10 min
                  </button>
                </li>
              ))}
            </ul>
          )}
        </FigurePanel>
      </div>

      <div>
        <h3 className="text-ink text-[16px] font-semibold">Sent tonight</h3>
        {page.data.items.length === 0 ? (
          <p className="text-ink-3 mt-2 text-[12.5px]">Nothing pushed yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--line-soft)]">
            {page.data.items.map((u) => (
              <li key={u.id} className="flex items-start gap-3 py-3">
                <span className={cn("bg-sunken text-ink-2 grid size-8 shrink-0 place-items-center rounded-full")}>{ICON[u.kind]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink text-[13.5px]">{u.text}</p>
                  <p className="text-ink-3 mt-0.5 text-[11.5px]">
                    {KIND_LABEL[u.kind]} · {AUDIENCE_LABEL[u.audience]} · {u.recipients} {u.recipients === 1 ? "person" : "people"}
                  </p>
                </div>
                <span className="text-ink-3 shrink-0 font-mono text-[11px]" title={relativeTime(u.sent_at)}>
                  {formatTime(u.sent_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
