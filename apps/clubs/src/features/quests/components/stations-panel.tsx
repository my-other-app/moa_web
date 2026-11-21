"use client";

import * as React from "react";
import QRCode from "qrcode";
import { useQueryClient } from "@tanstack/react-query";
import { CopyIcon, GiftIcon, LinkIcon, MapPinIcon, PlusIcon } from "lucide-react";
import { formatDateTime, formatNumber, plural, relativeTime } from "@moa/app-kit";
import { qk } from "@moa/api";
import {
  Button,
  CardLabel,
  Checkbox,
  ChoiceCard,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FigurePanel,
  NativeSelect,
  Skeleton,
  StatusBadge,
  cn,
  toast,
} from "@moa/ui";

import { useIssueGateLink, useRevokeGateLink } from "@/features/doors/queries";
import type { GateLink } from "@/features/doors/schemas";

import { errorText } from "../lib/time";
import { useCreateStation } from "../queries";
import { STATION_NAME_MAX, TASK_TITLE_MAX, type QuestAdmin, type QuestStation, type QuestTask } from "../schemas";

/** The task that names this station, if any (the server may send it on the station, or only on the task). */
export function stationTask(q: Pick<QuestAdmin, "tasks">, s: QuestStation): Pick<QuestTask, "id" | "title" | "points"> | null {
  if (s.task) return s.task;
  return q.tasks.find((t) => t.kind === "station" && (t.config.door_id === s.id || t.station?.door_id === s.id)) ?? null;
}

const LINK_DAYS = [1, 3, 7, 30] as const;

/** A door link shown once: the QR to scan from the phone at the booth, and the address to copy. */
export function LinkReveal({ link, place }: { link: Pick<GateLink, "url" | "expires_at">; place: string }) {
  const [png, setPng] = React.useState<string | null>(null);
  React.useEffect(() => {
    let live = true;
    QRCode.toDataURL(link.url, { margin: 1, width: 240 })
      .then((v) => live && setPng(v))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [link.url]);
  return (
    <div className="grid gap-3">
      {png ? (
        // A data URL drawn in the browser; next/image has nothing to optimise.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={png} alt={`QR code for the ${place} door link`} className="mx-auto size-56 rounded-xl bg-white p-2" />
      ) : (
        <Skeleton className="mx-auto size-56 rounded-xl" />
      )}
      <div className="flex gap-2">
        <input readOnly value={link.url} aria-label="Door link" className="input min-w-0 flex-1 font-mono" onFocus={(e) => e.currentTarget.select()} />
        <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(link.url).then(() => toast.success("Link copied"))}>
          <CopyIcon /> Copy
        </Button>
      </div>
      <p className="text-ink-3 text-[12px] leading-[1.5]">
        Shown once. The phone that opens it needs no account{link.expires_at ? ` and it stops working ${formatDateTime(link.expires_at)}` : ""}.
      </p>
    </div>
  );
}

type Made = { name: string; purpose: "station" | "swag_desk"; link: GateLink | null; task: string | null };

function NewStationDialog({ eventId, q, open, onClose }: { eventId: number; q: QuestAdmin; open: boolean; onClose: () => void }) {
  const create = useCreateStation(eventId);
  const [purpose, setPurpose] = React.useState<"station" | "swag_desk">("station");
  const [name, setName] = React.useState("");
  const [withTask, setWithTask] = React.useState(true);
  const [taskTitle, setTaskTitle] = React.useState("");
  const [points, setPoints] = React.useState("10");
  const [required, setRequired] = React.useState(false);
  const [withLink, setWithLink] = React.useState(true);
  const [days, setDays] = React.useState<number>(3);
  const [made, setMade] = React.useState<Made | null>(null);
  const id = React.useId();
  const title = taskTitle.trim() || (name.trim() ? `Visit ${name.trim()}` : "");
  const pointsOk = q.mode !== "points" || (Number.isInteger(Number(points)) && Number(points) >= 0 && Number(points) <= 1000);
  // "Desk" is where a check-in by hand is recorded when a console names no door: it stays an entrance (§7.1).
  const nameProblem = name.trim().toLowerCase() === "desk" ? "“Desk” is kept for check-ins by hand: pick another name." : null;
  const close = () => {
    setMade(null);
    setName("");
    setTaskTitle("");
    onClose();
  };
  const submit = async () => {
    if (!name.trim() || !pointsOk || nameProblem) return;
    try {
      const res = await create.mutateAsync({
        name: name.trim(),
        purpose,
        ...(purpose === "station" && withTask ? { task: { title, required, ...(q.mode === "points" ? { points: Number(points) } : {}) } } : {}),
        ...(withLink ? { link: { days } } : {}),
      });
      setMade({ name: name.trim(), purpose, link: res.link ?? null, task: res.task?.title ?? null });
      toast.success(`${name.trim()} added`);
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[520px]">
        {made ? (
          <>
            <DialogHeader>
              <DialogTitle>{made.name} is ready</DialogTitle>
              <DialogDescription>
                {made.purpose === "station"
                  ? `A scan here records a visit${made.task ? ` and ticks “${made.task}”` : ""}. Nobody is checked in at a station, and its staff see a guest's name only.`
                  : "Staff scan a ticket here to see the guest's rewards and hand them over. Nobody is checked in here."}
              </DialogDescription>
            </DialogHeader>
            {made.link ? (
              <LinkReveal link={made.link} place={made.name} />
            ) : (
              <p className="text-ink-2 text-[13px]">No door link yet: make one from the list when you know who will run it, or add volunteers to it under Doors.</p>
            )}
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <DialogHeader>
              <DialogTitle>Add a station or swag desk</DialogTitle>
              <DialogDescription>Both are doors of the event that admit nobody: booth staff scan tickets on the door console, with a door link and no account.</DialogDescription>
            </DialogHeader>
            <div role="radiogroup" aria-label="What it is" className="grid gap-2">
              <ChoiceCard checked={purpose === "station"} onClick={() => setPurpose("station")} title="Station" hint="A booth or a room (Google Cloud booth, Workshop A): a scan records the guest's visit for the quest." />
              <ChoiceCard checked={purpose === "swag_desk"} onClick={() => setPurpose("swag_desk")} title="Swag desk" hint="Where rewards are collected: a scan shows what the guest unlocked, with their size, and Handed over records it." />
            </div>
            <div>
              <label htmlFor={`${id}-name`} className="eyebrow mb-1.5 block">
                Name
              </label>
              <input id={`${id}-name`} className="input" value={name} maxLength={STATION_NAME_MAX} placeholder={purpose === "station" ? "Google Cloud booth" : "Swag desk"} onChange={(e) => setName(e.target.value)} />
              {nameProblem ? <p className="text-refuse mt-1 text-[11.5px]">{nameProblem}</p> : null}
            </div>
            {purpose === "station" ? (
              <div className="bg-sunken grid gap-3 rounded-xl p-3">
                <label className="flex items-start gap-2.5">
                  <Checkbox checked={withTask} onCheckedChange={(v) => setWithTask(v === true)} className="mt-0.5" aria-label="Make a task for it" />
                  <span className="text-ink text-[13px] font-medium">Make a task for it</span>
                </label>
                {withTask ? (
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px]">
                    <div>
                      <label htmlFor={`${id}-task`} className="eyebrow mb-1.5 block">
                        Task title
                      </label>
                      <input id={`${id}-task`} className="input" value={taskTitle} maxLength={TASK_TITLE_MAX} placeholder={title || "Visit the booth"} onChange={(e) => setTaskTitle(e.target.value)} />
                    </div>
                    {q.mode === "points" ? (
                      <div>
                        <label htmlFor={`${id}-pts`} className="eyebrow mb-1.5 block">
                          Points
                        </label>
                        <input id={`${id}-pts`} type="number" min={0} max={1000} className="input" value={points} onChange={(e) => setPoints(e.target.value)} />
                      </div>
                    ) : null}
                    <label className="flex items-center gap-2.5 sm:col-span-2">
                      <Checkbox checked={required} onCheckedChange={(v) => setRequired(v === true)} aria-label="Required task" />
                      <span className="text-ink-2 text-[12.5px]">Required: no reward unlocks without it</span>
                    </label>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2.5">
                <Checkbox checked={withLink} onCheckedChange={(v) => setWithLink(v === true)} aria-label="Make its door link now" />
                <span className="text-ink text-[13px] font-medium">Make its door link now</span>
              </label>
              {withLink ? (
                <NativeSelect aria-label="The link works for" value={String(days)} onChange={(e) => setDays(Number(e.target.value))} className="w-auto">
                  {LINK_DAYS.map((d) => (
                    <option key={d} value={d}>
                      {plural(d, "day")}
                    </option>
                  ))}
                </NativeSelect>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || !pointsOk || !!nameProblem || create.isPending}>
                <PlusIcon /> {create.isPending ? "Adding…" : purpose === "station" ? "Add station" : "Add swag desk"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StationRow({ eventId, q, s, canEdit, onLink }: { eventId: number; q: QuestAdmin; s: QuestStation; canEdit: boolean; onLink: (s: QuestStation) => void }) {
  const task = stationTask(q, s);
  const revoke = useRevokeGateLink(eventId);
  const qc = useQueryClient();
  const live = !!s.link && !s.link.expired;
  const desk = s.purpose === "swag_desk";
  return (
    <li className="border-line-soft flex flex-wrap items-center gap-3 border-t px-4 py-3 first:border-t-0">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", s.active ? "bg-brand-soft text-brand" : "bg-sunken text-ink-3")} aria-hidden="true">
        {desk ? <GiftIcon className="size-[18px]" /> : <MapPinIcon className="size-[18px]" />}
      </span>
      <div className="min-w-[180px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-[13.5px] font-medium", s.active ? "text-ink" : "text-ink-3")}>{s.name}</span>
          <span className="tag tag-neutral">{desk ? "Swag desk" : "Station"}</span>
          {!s.active ? <StatusBadge label="Retired" /> : null}
          {s.link ? s.link.expired ? <StatusBadge tone="warning" label="Link expired" /> : <StatusBadge tone="success" label="Door link on" /> : null}
        </div>
        <p className="text-ink-3 mt-0.5 truncate text-[12px]">
          {desk
            ? "Rewards are handed over here."
            : task
              ? `Ticks “${task.title}”${q.mode === "points" && task.points ? ` · ${task.points} pts` : ""}`
              : "No task names it yet: visits are recorded and count once one does."}
          {live ? ` · link …${s.link!.prefix}${s.link!.expires_at ? `, until ${formatDateTime(s.link!.expires_at)}` : ""}` : ""}
        </p>
      </div>
      <span className="w-[96px] text-right">
        <span className="text-ink block font-mono text-[13px] tabular-nums">{formatNumber(desk ? (s.handovers ?? 0) : s.visits)}</span>
        <span className="text-ink-3 block text-[11px]">{desk ? "handed over" : s.last_visit_at ? `visits · ${relativeTime(s.last_visit_at)}` : "visits"}</span>
      </span>
      {canEdit && s.active ? (
        <span className="flex items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => onLink(s)}>
            <LinkIcon /> {live ? "New link" : "Door link"}
          </Button>
          {live ? (
            <Button
              variant="ghost"
              size="sm"
              danger
              disabled={revoke.isPending}
              aria-label={`Switch off the door link for ${s.name}`}
              onClick={() => revoke.mutate(s.id, { onSuccess: () => void qc.invalidateQueries({ queryKey: [...qk.events.detail(eventId), "quests"] }) })}
            >
              Switch off
            </Button>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}

function NewLinkDialog({ eventId, station, onClose }: { eventId: number; station: QuestStation | null; onClose: () => void }) {
  const issue = useIssueGateLink(eventId);
  const qc = useQueryClient();
  const [days, setDays] = React.useState<number>(3);
  const [link, setLink] = React.useState<GateLink | null>(null);
  const close = () => {
    setLink(null);
    onClose();
  };
  return (
    <Dialog open={station !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-[460px]">
        {station ? (
          <>
            <DialogHeader>
              <DialogTitle>Door link for {station.name}</DialogTitle>
              <DialogDescription>
                {station.purpose === "swag_desk"
                  ? "A phone that opens it runs the swag desk with no account: it shows a guest's rewards and hands them over."
                  : "A phone that opens it records visits here with no account. Hand it to the booth's staff: they see a guest's name only."}
                {station.link && !station.link.expired ? " Making a new one switches the current link off." : ""}
              </DialogDescription>
            </DialogHeader>
            {link ? (
              <LinkReveal link={link} place={station.name} />
            ) : (
              <label className="flex items-center gap-2.5">
                <span className="text-ink-2 text-[13px]">It works for</span>
                <NativeSelect aria-label="The link works for" value={String(days)} onChange={(e) => setDays(Number(e.target.value))} className="w-auto">
                  {LINK_DAYS.map((d) => (
                    <option key={d} value={d}>
                      {plural(d, "day")}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            )}
            <DialogFooter>
              {link ? (
                <Button onClick={close}>Done</Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={close}>
                    Cancel
                  </Button>
                  <Button
                    disabled={issue.isPending}
                    onClick={() =>
                      issue.mutate(
                        { doorId: station.id, can_walkup: false, days },
                        {
                          onSuccess: (l) => {
                            setLink(l);
                            void qc.invalidateQueries({ queryKey: [...qk.events.detail(eventId), "quests"] });
                          },
                        }
                      )
                    }
                  >
                    <LinkIcon /> Make the link
                  </Button>
                </>
              )}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Stations (a visit per guest) and swag desks (rewards handed over), with their door links. */
export function StationsPanel({ eventId, q, canEdit }: { eventId: number; q: QuestAdmin; canEdit: boolean }) {
  const [adding, setAdding] = React.useState(false);
  const [linkFor, setLinkFor] = React.useState<QuestStation | null>(null);
  const stations = [...q.stations].sort((a, b) => Number(b.active) - Number(a.active) || (a.purpose === b.purpose ? 0 : a.purpose === "station" ? -1 : 1));
  const desks = q.stations.filter((s) => s.purpose === "swag_desk" && s.active).length;
  const rewards = q.milestones.some((m) => m.rewards.length > 0);
  return (
    <FigurePanel className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start gap-3 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <CardLabel right={stations.length ? <span className="text-ink-3 font-mono text-[11px]">{plural(stations.length, "door")}</span> : null}>Stations and swag desks</CardLabel>
          <p className="text-ink-3 mt-1 text-[12px] leading-[1.5]">
            Doors that admit nobody. Give each one&apos;s door link (a QR) to the people running it; the entrances work exactly as before.
          </p>
        </div>
        {canEdit ? (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <PlusIcon /> Add a station or desk
          </Button>
        ) : null}
      </div>
      {rewards && desks === 0 ? (
        <p className="text-caution px-4 pt-2 text-[12px] leading-[1.5]">There are rewards but no swag desk yet: add one so guests know where to collect them.</p>
      ) : null}
      {stations.length === 0 ? (
        <EmptyState size="sm" icon={<MapPinIcon />} title="No stations yet" description="A station per sponsor booth or workshop room, and one swag desk where rewards are collected." />
      ) : (
        <ul className="mt-2">
          {stations.map((s) => (
            <StationRow key={s.id} eventId={eventId} q={q} s={s} canEdit={canEdit} onLink={setLinkFor} />
          ))}
        </ul>
      )}
      <NewStationDialog eventId={eventId} q={q} open={adding} onClose={() => setAdding(false)} />
      <NewLinkDialog eventId={eventId} station={linkFor} onClose={() => setLinkFor(null)} />
    </FigurePanel>
  );
}
