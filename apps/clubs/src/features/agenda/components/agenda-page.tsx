"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClockIcon, PaletteIcon, PencilIcon, PrinterIcon, Trash2Icon } from "lucide-react";
import { PageHeader } from "@moa/app-kit";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button, EmptyState, InlineAlert, Skeleton, StatusBadge, cn } from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useEventDetail } from "@/features/events";
import { openPdf } from "@/features/idcards";

import { programmePdfUrl } from "../api";
import { useAgenda, useCreateAgendaItem, useDeleteAgendaItem, useUpdateAgendaItem } from "../queries";
import { agendaDay, agendaTime, dayOf, type Agenda, type AgendaItem, type AgendaItemInput } from "../schemas";

const panel = "rounded-lg border-[0.5px] border-[var(--swatch-grey)]";
const heading = "font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground";
const note = "text-[12px] leading-[1.5] text-muted-foreground";
const control = "h-9 w-full rounded-md border bg-muted/40 px-2.5 text-[13px]";

/** A datetime-local value from an instant, in the browser's zone; and back. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => new Date(v).toISOString();

type Values = { startsLocal: string; endsLocal: string; title: string; speaker: string; location: string; description: string };
const blank = (startsLocal: string): Values => ({ startsLocal, endsLocal: "", title: "", speaker: "", location: "", description: "" });

function BlockForm({ eventId, editing, defaultStart, onDone }: { eventId: number; editing: AgendaItem | null; defaultStart: string; onDone: () => void }) {
  const create = useCreateAgendaItem(eventId);
  const update = useUpdateAgendaItem(eventId);
  const [v, setV] = React.useState<Values>(() =>
    editing
      ? { startsLocal: toLocalInput(editing.starts_at), endsLocal: editing.ends_at ? toLocalInput(editing.ends_at) : "", title: editing.title, speaker: editing.speaker ?? "", location: editing.location ?? "", description: editing.description ?? "" }
      : blank(defaultStart)
  );
  const [error, setError] = React.useState<string | null>(null);
  const field = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((cur) => ({ ...cur, [k]: e.target.value }));
  const busy = create.isPending || update.isPending;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.title.trim()) return setError("Give the block a title.");
    if (!v.startsLocal) return setError("When does it start?");
    if (v.endsLocal && v.endsLocal <= v.startsLocal) return setError("A block must end after it starts.");
    setError(null);
    const body: AgendaItemInput = {
      starts_at: fromLocalInput(v.startsLocal),
      ends_at: v.endsLocal ? fromLocalInput(v.endsLocal) : null,
      title: v.title.trim(),
      speaker: v.speaker.trim() || null,
      location: v.location.trim() || null,
      description: v.description.trim() || null,
    };
    if (editing) update.mutate({ id: editing.id, body }, { onSuccess: onDone });
    else create.mutate(body, { onSuccess: () => setV((cur) => ({ ...blank(cur.startsLocal), startsLocal: cur.endsLocal || cur.startsLocal })) });
  };
  return (
    <form onSubmit={submit} className={cn(panel, "space-y-3 p-4")}>
      <p className={heading}>{editing ? `Edit “${editing.title}”` : "Add a block"}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-[12px]">
          Starts
          <input type="datetime-local" value={v.startsLocal} onChange={field("startsLocal")} className={cn(control, "font-mono")} required />
        </label>
        <label className="space-y-1 text-[12px]">
          Ends <span className="text-muted-foreground">(optional)</span>
          <input type="datetime-local" value={v.endsLocal} onChange={field("endsLocal")} className={cn(control, "font-mono")} />
        </label>
      </div>
      <label className="block space-y-1 text-[12px]">
        Title
        <input value={v.title} onChange={field("title")} placeholder="Opening keynote" maxLength={160} className={control} />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-[12px]">
          Speaker <span className="text-muted-foreground">(optional)</span>
          <input value={v.speaker} onChange={field("speaker")} placeholder="Ananya Iyer" maxLength={120} className={control} />
        </label>
        <label className="space-y-1 text-[12px]">
          Room <span className="text-muted-foreground">(optional)</span>
          <input value={v.location} onChange={field("location")} placeholder="Main hall" maxLength={120} className={control} />
        </label>
      </div>
      <label className="block space-y-1 text-[12px]">
        Description <span className="text-muted-foreground">(optional)</span>
        <textarea value={v.description} onChange={field("description")} rows={2} maxLength={1000} placeholder="Capped at 40. Mentor tickets have priority." className={cn(control, "h-auto py-2")} />
      </label>
      {error ? <p className="text-[12.5px] text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className={cn("flex-1", pressable)}>
          {editing ? "Save block" : "Add to run of show"}
        </Button>
        {editing ? (
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function BlockRow({ item, tz, showDay, onEdit, onDelete }: { item: AgendaItem; tz: string; showDay: boolean; onEdit: () => void; onDelete: () => void }) {
  const [confirm, setConfirm] = React.useState(false);
  return (
    <li className="flex gap-3.5 px-4 py-3">
      <div className="w-[78px] shrink-0 font-mono text-[12px] leading-[1.6] tabular-nums">
        {agendaTime(item.starts_at, tz)}
        {item.ends_at ? <span className="block text-muted-foreground">– {agendaTime(item.ends_at, tz)}</span> : null}
        {showDay ? <span className="block text-[10px] text-muted-foreground">{agendaDay(item.starts_at, tz)}</span> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-medium">{item.title}</span>
          {item.parallel ? <StatusBadge tone="default" label="Parallel" /> : null}
        </div>
        {item.description ? <p className="mt-1 text-[12.5px] leading-[1.5] text-muted-foreground">{item.description}</p> : null}
        {item.speaker || item.location ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
            {item.speaker ? <span className="text-[12px]">{item.speaker}</span> : null}
            {item.location ? <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-muted-foreground">{item.location}</span> : null}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-start gap-0.5">
        <Button size="icon-xs" variant="ghost" aria-label={`Edit ${item.title}`} onClick={onEdit}>
          <PencilIcon />
        </Button>
        <Button size="icon-xs" variant="ghost" aria-label={`Remove ${item.title}`} onClick={() => setConfirm(true)}>
          <Trash2Icon />
        </Button>
      </div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{item.title}” from the agenda?</AlertDialogTitle>
            <AlertDialogDescription>The block disappears from the agenda, the event page, the app and the programme. Nothing else changes.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Remove block</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function RunOfShow({ eventId, agenda, onEdit }: { eventId: number; agenda: Agenda; onEdit: (i: AgendaItem) => void }) {
  const remove = useDeleteAgendaItem(eventId);
  const tz = agenda.timezone;
  const days = new Set(agenda.items.map((i) => dayOf(i.starts_at, tz)));
  return (
    <section className={panel}>
      <div className="px-4 pt-4">
        <p className={heading}>Run of show</p>
        <p className={note}>Ordered by start time; two blocks at the same time stay side by side as parallel tracks.</p>
      </div>
      {agenda.items.length === 0 ? (
        <div className="p-4">
          <EmptyState tone="muted" title="The run of show is empty" description="Add the first block on the right. Blocks order themselves by start time." />
        </div>
      ) : (
        <ul className="mt-2 divide-y">
          {agenda.items.map((i) => (
            <BlockRow key={i.id} item={i} tz={tz} showDay={days.size > 1} onEdit={() => onEdit(i)} onDelete={() => remove.mutate(i.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** The agenda: what the event page, the app, the kiosk and the printed programme all read. */
export function AgendaPage({ eventId }: { eventId: number }) {
  const event = useEventDetail(eventId);
  const agenda = useAgenda(eventId);
  const [editing, setEditing] = React.useState<AgendaItem | null>(null);
  const [printing, setPrinting] = React.useState(false);
  const startIso = event.data?.event_datetime;
  const defaultStart = React.useMemo(() => toLocalInput((startIso ? new Date(startIso) : new Date()).toISOString()), [startIso]);
  const download = () => {
    setPrinting(true);
    openPdf(programmePdfUrl(eventId));
    setTimeout(() => setPrinting(false), 1500);
  };
  return (
    <div className="space-y-6">
      <PageHeader
        title="Agenda"
        description="The run of show. Guests see it on the event page and in the app; the kiosk plays it while a card prints; the programme prints from it."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild className={pressable}>
              <Link href={`/events/${eventId}/design?kind=agenda`}>
                <PaletteIcon /> Design the programme
              </Link>
            </Button>
            <Button variant="outline" onClick={download} disabled={printing} className={pressable} title="The programme as designed, fitted onto A4">
              <PrinterIcon /> Download A4 programme
            </Button>
          </div>
        }
      />
      {agenda.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : agenda.isError ? (
        <EmptyState tone="muted" title="Could not load the agenda" description={agenda.error.message} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <RunOfShow eventId={eventId} agenda={agenda.data} onEdit={setEditing} />
          <div className="space-y-3">
            <BlockForm key={editing?.id ?? "new"} eventId={eventId} editing={editing} defaultStart={defaultStart} onDone={() => setEditing(null)} />
            <InlineAlert tone="info" title={agenda.data.has_programme ? "The programme is designed" : "No programme design yet"}>
              {agenda.data.has_programme ? "The kiosk shows it on its attract screen, and the A4 download prints it with these sessions." : "The A4 download uses the kiosk starter until you design one. The kiosk shows the plain banner."}
            </InlineAlert>
            <p className={cn(note, "flex items-start gap-1.5")}>
              <CalendarClockIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Times are entered in your browser&apos;s zone and shown to guests in the event&apos;s zone ({agenda.data.timezone}).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
