"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarClockIcon,
  MapPinIcon,
  MicIcon,
  PaletteIcon,
  PencilIcon,
  PrinterIcon,
  Trash2Icon,
} from "lucide-react";
import { formatNumber, plural } from "@moa/app-kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  CardLabel,
  cn,
  EmptyState,
  FigurePanel,
  IconButton,
  Notice,
  Skeleton,
  StatTile,
  StatusBadge,
} from "@moa/ui";

import { useEventDetail } from "@/features/events";
import { openPdf } from "@/features/idcards";

import { programmePdfUrl } from "../api";
import {
  useAgenda,
  useCreateAgendaItem,
  useDeleteAgendaItem,
  useUpdateAgendaItem,
} from "../queries";
import {
  agendaDay,
  agendaTime,
  dayOf,
  type Agenda,
  type AgendaItem,
  type AgendaItemInput,
} from "../schemas";

/**
 * The agenda: the running order the event page, the app, the kiosk and the
 * printed programme all read.
 *
 * Four figures on the day's shape — how many blocks, how long it runs, the
 * speakers, the rooms — and a notice for what is on now (or, before the
 * day, for a programme not designed yet). Then the running order, day by
 * day, with the free time between blocks shown, beside the form that adds
 * a block or corrects one.
 */
const field = "input";
const label = "eyebrow mb-1.5 block";
const MIN = 60_000;

/** A datetime-local value from an instant, in the browser's zone; and back. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => new Date(v).toISOString();
const ms = (iso: string) => new Date(iso).getTime();

function span(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

type Values = {
  startsLocal: string;
  endsLocal: string;
  title: string;
  speaker: string;
  location: string;
  description: string;
};
const blank = (startsLocal: string): Values => ({
  startsLocal,
  endsLocal: "",
  title: "",
  speaker: "",
  location: "",
  description: "",
});

function BlockForm({
  eventId,
  editing,
  defaultStart,
  onDone,
}: {
  eventId: number;
  editing: AgendaItem | null;
  defaultStart: string;
  onDone: () => void;
}) {
  const create = useCreateAgendaItem(eventId);
  const update = useUpdateAgendaItem(eventId);
  const id = React.useId();
  const [v, setV] = React.useState<Values>(() =>
    editing
      ? {
          startsLocal: toLocalInput(editing.starts_at),
          endsLocal: editing.ends_at ? toLocalInput(editing.ends_at) : "",
          title: editing.title,
          speaker: editing.speaker ?? "",
          location: editing.location ?? "",
          description: editing.description ?? "",
        }
      : blank(defaultStart),
  );
  const [error, setError] = React.useState<string | null>(null);
  const set =
    (k: keyof Values) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((cur) => ({ ...cur, [k]: e.target.value }));
  const busy = create.isPending || update.isPending;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.title.trim()) return setError("Give the block a title.");
    if (!v.startsLocal) return setError("When does it start?");
    if (v.endsLocal && v.endsLocal <= v.startsLocal)
      return setError("A block must end after it starts.");
    setError(null);
    const body: AgendaItemInput = {
      starts_at: fromLocalInput(v.startsLocal),
      ends_at: v.endsLocal ? fromLocalInput(v.endsLocal) : null,
      title: v.title.trim(),
      speaker: v.speaker.trim() || null,
      location: v.location.trim() || null,
      description: v.description.trim() || null,
    };
    if (editing)
      update.mutate({ id: editing.id, body }, { onSuccess: onDone });
    else
      create.mutate(body, {
        // The next block most often starts where this one ended.
        onSuccess: () =>
          setV((cur) => ({
            ...blank(cur.startsLocal),
            startsLocal: cur.endsLocal || cur.startsLocal,
          })),
      });
  };
  return (
    <FigurePanel className={cn("p-4", editing && "ring-brand-line")}>
      <form onSubmit={submit} noValidate className="grid gap-3">
        <CardLabel
          right={
            editing ? (
              <span className="text-ink-3 max-w-[60%] truncate text-[11px]">
                {editing.title}
              </span>
            ) : null
          }
        >
          {editing ? "Edit the block" : "Add a block"}
        </CardLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-start`} className={label}>
              Starts
            </label>
            <input
              id={`${id}-start`}
              type="datetime-local"
              value={v.startsLocal}
              onChange={set("startsLocal")}
              className={cn(field, "font-mono")}
              required
            />
          </div>
          <div>
            <label htmlFor={`${id}-end`} className={label}>
              Ends (optional)
            </label>
            <input
              id={`${id}-end`}
              type="datetime-local"
              value={v.endsLocal}
              onChange={set("endsLocal")}
              className={cn(field, "font-mono")}
            />
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-title`} className={label}>
            Title
          </label>
          <input
            id={`${id}-title`}
            value={v.title}
            onChange={set("title")}
            placeholder="Opening keynote"
            maxLength={160}
            className={field}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-speaker`} className={label}>
              Speaker (optional)
            </label>
            <input
              id={`${id}-speaker`}
              value={v.speaker}
              onChange={set("speaker")}
              placeholder="Ananya Iyer"
              maxLength={120}
              className={field}
            />
          </div>
          <div>
            <label htmlFor={`${id}-room`} className={label}>
              Room (optional)
            </label>
            <input
              id={`${id}-room`}
              value={v.location}
              onChange={set("location")}
              placeholder="Main hall"
              maxLength={120}
              className={field}
            />
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-about`} className={label}>
            Description (optional)
          </label>
          <textarea
            id={`${id}-about`}
            value={v.description}
            onChange={set("description")}
            rows={2}
            maxLength={1000}
            placeholder="Capped at 40. Mentor tickets have priority."
            className={field}
          />
        </div>
        {error ? (
          <p role="alert" className="text-refuse text-[12.5px]">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          {editing ? (
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" disabled={busy}>
            {editing ? "Save the block" : "Add to the agenda"}
          </Button>
        </div>
      </form>
    </FigurePanel>
  );
}

type Entry =
  | { kind: "item"; item: AgendaItem }
  | { kind: "gap"; key: string; minutes: number };

/** A day's blocks with the free time between them, when there is five minutes or more of it. */
function withGaps(items: AgendaItem[]): Entry[] {
  return items.reduce<{ out: Entry[]; latest: number | null }>(
    (acc, item) => {
      const start = ms(item.starts_at);
      const gap =
        acc.latest !== null && !item.parallel
          ? Math.round((start - acc.latest) / MIN)
          : 0;
      const end = item.ends_at ? ms(item.ends_at) : null;
      return {
        out: [
          ...acc.out,
          ...(gap >= 5
            ? [{ kind: "gap" as const, key: `gap-${item.id}`, minutes: gap }]
            : []),
          { kind: "item" as const, item },
        ],
        latest:
          end === null ? acc.latest : Math.max(acc.latest ?? end, end),
      };
    },
    { out: [], latest: null },
  ).out;
}

function BlockRow({
  item,
  tz,
  onNow,
  editing,
  onEdit,
  onRemove,
}: {
  item: AgendaItem;
  tz: string;
  onNow: boolean;
  editing: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const minutes = item.ends_at
    ? Math.round((ms(item.ends_at) - ms(item.starts_at)) / MIN)
    : null;
  return (
    <li
      className={cn(
        "border-line-soft grid grid-cols-[56px_minmax(0,1fr)_auto] gap-3 border-t px-4 py-3",
        editing && "bg-brand-soft",
      )}
      aria-current={editing ? "true" : undefined}
    >
      <div className="font-mono text-[12.5px] leading-[1.5] tabular-nums">
        <span className="text-ink block">{agendaTime(item.starts_at, tz)}</span>
        {item.ends_at ? (
          <span className="text-ink-3 block">{agendaTime(item.ends_at, tz)}</span>
        ) : null}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink text-[13.5px] font-medium">{item.title}</span>
          {onNow ? <StatusBadge tone="success" label="On now" /> : null}
          {item.parallel ? <StatusBadge tone="info" label="Parallel" /> : null}
          {minutes ? (
            <span className="text-ink-3 font-mono text-[11px]">{span(minutes)}</span>
          ) : null}
        </div>
        {item.description ? (
          <p className="text-ink-2 mt-1 text-[12.5px] leading-[1.5]">
            {item.description}
          </p>
        ) : null}
        {item.speaker || item.location ? (
          <div className="text-ink-3 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
            {item.speaker ? (
              <span className="flex items-center gap-1">
                <MicIcon className="size-3.5" aria-hidden="true" />
                <span className="text-ink-2">{item.speaker}</span>
              </span>
            ) : null}
            {item.location ? (
              <span className="flex items-center gap-1">
                <MapPinIcon className="size-3.5" aria-hidden="true" />
                {item.location}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex items-start gap-1">
        <IconButton label={`Edit ${item.title}`} onClick={onEdit}>
          <PencilIcon />
        </IconButton>
        <IconButton label={`Remove ${item.title}`} danger onClick={onRemove}>
          <Trash2Icon />
        </IconButton>
      </div>
    </li>
  );
}

function RunningOrder({
  eventId,
  agenda,
  editingId,
  current,
  onEdit,
}: {
  eventId: number;
  agenda: Agenda;
  editingId: string | null;
  current: string | null;
  onEdit: (i: AgendaItem) => void;
}) {
  const remove = useDeleteAgendaItem(eventId);
  const [removing, setRemoving] = React.useState<AgendaItem | null>(null);
  const tz = agenda.timezone;
  const days = agenda.items.reduce<
    { day: string; label: string; items: AgendaItem[] }[]
  >((acc, i) => {
    const d = dayOf(i.starts_at, tz);
    const last = acc.at(-1);
    return last && last.day === d
      ? [...acc.slice(0, -1), { ...last, items: [...last.items, i] }]
      : [...acc, { day: d, label: agendaDay(i.starts_at, tz), items: [i] }];
  }, []);
  return (
    <FigurePanel className="overflow-hidden p-0">
      <div className="px-4 pt-4">
        <CardLabel
          right={<span className="text-ink-3 font-mono text-[11px]">{tz}</span>}
        >
          Running order
        </CardLabel>
        <p className="text-ink-3 mt-1 text-[12px] leading-[1.5]">
          Ordered by start time. Blocks whose times overlap run side by side as
          parallel tracks.
        </p>
      </div>
      {agenda.items.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<CalendarClockIcon />}
          title="The agenda is empty"
          description="Add the first block: the doors, the welcome, the first talk. Blocks order themselves by start time."
        />
      ) : (
        <div className="mt-2">
          {days.map((g) => (
            <section key={g.day} aria-label={g.label}>
              {days.length > 1 ? (
                <div className="border-line-soft bg-sunken/60 flex items-center justify-between border-t px-4 py-1.5">
                  <span className="eyebrow">{g.label}</span>
                  <span className="text-ink-3 font-mono text-[11px]">
                    {plural(g.items.length, "block")}
                  </span>
                </div>
              ) : null}
              <ul>
                {withGaps(g.items).map((e) =>
                  e.kind === "gap" ? (
                    <li
                      key={e.key}
                      className="border-line-soft text-ink-3 flex items-center gap-3 border-t border-dashed px-4 py-1.5 text-[11.5px]"
                    >
                      <span className="w-[56px]" />
                      {span(e.minutes)} free
                    </li>
                  ) : (
                    <BlockRow
                      key={e.item.id}
                      item={e.item}
                      tz={tz}
                      onNow={current === e.item.id}
                      editing={editingId === e.item.id}
                      onEdit={() => onEdit(e.item)}
                      onRemove={() => setRemoving(e.item)}
                    />
                  ),
                )}
              </ul>
            </section>
          ))}
        </div>
      )}
      <AlertDialog
        open={removing !== null}
        onOpenChange={(o) => (o ? undefined : setRemoving(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove “{removing?.title}” from the agenda?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The block disappears from the agenda, the event page, the app and
              the programme. Nothing else changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Keep</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (removing) remove.mutate(removing.id);
                setRemoving(null);
              }}
            >
              Remove block
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FigurePanel>
  );
}

function Shape({ agenda }: { agenda: Agenda }) {
  const items = agenda.items;
  const tz = agenda.timezone;
  const first = Math.min(...items.map((i) => ms(i.starts_at)));
  const last = Math.max(
    ...items.map((i) => ms(i.ends_at ?? i.starts_at)),
  );
  const days = new Set(items.map((i) => dayOf(i.starts_at, tz))).size;
  const speakers = new Set(
    items.map((i) => i.speaker?.trim()).filter((s): s is string => !!s),
  );
  const rooms = [
    ...new Set(
      items.map((i) => i.location?.trim()).filter((s): s is string => !!s),
    ),
  ];
  const parallel = items.filter((i) => i.parallel).length;
  const bare = items.filter((i) => !i.speaker?.trim()).length;
  const at = (t: number) => {
    const iso = new Date(t).toISOString();
    return days > 1
      ? `${agendaDay(iso, tz)} ${agendaTime(iso, tz)}`
      : agendaTime(iso, tz);
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label="Blocks"
        value={formatNumber(items.length)}
        note={parallel ? `${parallel} run side by side` : "one track"}
      />
      <StatTile
        label="Runs for"
        value={days > 1 ? `${days} days` : span(Math.round((last - first) / MIN))}
        note={`${at(first)} to ${at(last)}`}
      />
      <StatTile
        label="Speakers"
        value={formatNumber(speakers.size)}
        note={
          bare
            ? `${plural(bare, "block")} without one`
            : "every block has one"
        }
      />
      <StatTile
        label="Rooms"
        value={formatNumber(rooms.length)}
        note={
          rooms.length
            ? `${rooms.slice(0, 2).join(", ")}${rooms.length > 2 ? ` and ${rooms.length - 2} more` : ""}`
            : "no room named yet"
        }
      />
    </div>
  );
}

/** The agenda: what the event page, the app, the kiosk and the printed programme all read. */
export function AgendaPage({ eventId }: { eventId: number }) {
  const event = useEventDetail(eventId);
  const agenda = useAgenda(eventId);
  const [editing, setEditing] = React.useState<AgendaItem | null>(null);
  const [printing, setPrinting] = React.useState(false);
  const [now] = React.useState(() => Date.now());
  const startIso = event.data?.event_datetime;
  const defaultStart = React.useMemo(
    () =>
      toLocalInput((startIso ? new Date(startIso) : new Date()).toISOString()),
    [startIso],
  );
  const download = () => {
    setPrinting(true);
    openPdf(programmePdfUrl(eventId));
    setTimeout(() => setPrinting(false), 1500);
  };
  const a = agenda.data;
  const items = a?.items ?? [];
  const current =
    items.find(
      (i) => i.ends_at && ms(i.starts_at) <= now && now < ms(i.ends_at),
    ) ?? null;
  const next = current
    ? (items.find((i) => ms(i.starts_at) >= ms(current.ends_at!)) ?? null)
    : null;
  const days = a ? new Set(items.map((i) => dayOf(i.starts_at, a.timezone))).size : 0;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-ink m-0 text-[17px] font-semibold tracking-[-0.02em]">
            Agenda
          </h2>
          <p className="text-ink-3 mt-1 text-[12.5px]">
            {a && items.length
              ? `${plural(items.length, "block")} · from ${agendaTime(items[0]!.starts_at, a.timezone)}${days > 1 ? ` over ${days} days` : ""} · ${a.has_programme ? "programme designed" : "no programme design yet"}`
              : "The running order guests see on the event page, in the app, on the kiosk and in the printed programme."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/events/${eventId}/design?kind=agenda`}
            className="btn btn-secondary"
          >
            <PaletteIcon />{" "}
            {a?.has_programme ? "Edit the programme" : "Design the programme"}
          </Link>
          <Button
            variant="secondary"
            onClick={download}
            disabled={printing}
            title="The programme as designed, fitted onto A4"
          >
            <PrinterIcon /> Download A4
          </Button>
        </div>
      </div>

      {agenda.isPending ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[118px] rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Skeleton className="h-[360px] rounded-2xl" />
            <Skeleton className="h-[360px] rounded-2xl" />
          </div>
        </>
      ) : agenda.isError ? (
        <EmptyState
          tone="muted"
          title="Could not load the agenda"
          description="Check the connection, then try again."
          action={
            <Button variant="secondary" onClick={() => void agenda.refetch()}>
              Try again
            </Button>
          }
        />
      ) : (
        <>
          {items.length ? <Shape agenda={agenda.data} /> : null}
          {current ? (
            <Notice tone="accent" tag="On now">
              {current.title}
              {current.location ? ` · ${current.location}` : ""} until{" "}
              {agendaTime(current.ends_at!, agenda.data.timezone)}.
              {next
                ? ` Next: ${next.title} at ${agendaTime(next.starts_at, agenda.data.timezone)}.`
                : " It is the last block."}
            </Notice>
          ) : !agenda.data.has_programme ? (
            <Notice
              tone="neutral"
              tag="Programme"
              action={
                <Link
                  href={`/events/${eventId}/design?kind=agenda`}
                  className="btn btn-secondary btn-sm"
                >
                  Design it
                </Link>
              }
            >
              No programme design yet. The A4 download uses the kiosk starter,
              and the kiosk shows a plain banner until you design one.
            </Notice>
          ) : null}
          <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <RunningOrder
              eventId={eventId}
              agenda={agenda.data}
              editingId={editing?.id ?? null}
              current={current?.id ?? null}
              onEdit={setEditing}
            />
            <div className="grid gap-2 lg:sticky lg:top-4">
              <BlockForm
                key={editing?.id ?? "new"}
                eventId={eventId}
                editing={editing}
                defaultStart={defaultStart}
                onDone={() => setEditing(null)}
              />
              <p className="text-ink-3 flex items-start gap-1.5 px-1 text-[11.5px] leading-[1.5]">
                <CalendarClockIcon
                  className="mt-0.5 size-3.5 shrink-0"
                  aria-hidden="true"
                />
                Times are typed in your browser&apos;s zone and shown to guests
                in the event&apos;s ({agenda.data.timezone}).
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
