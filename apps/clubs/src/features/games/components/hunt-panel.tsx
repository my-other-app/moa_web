"use client";

import * as React from "react";
import { FlagIcon, PlusIcon, PrinterIcon, Trash2Icon } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FigurePanel,
  Notice,
  Segmented,
  Skeleton,
  StatusBadge,
  cn,
  toast,
} from "@moa/ui";

import { pointsPdfUrl } from "../api";
import { errorText, fromLocalInput, lengthText, toLocalInput } from "../lib/time";
import { useCreatePoint, useDeletePoint, useHunt, useHuntAction, useHuntLive, usePoints, useSaveHunt, useUpdatePoint } from "../queries";
import {
  ACTION_LABEL,
  CLUE_MAX,
  HINT_MAX,
  HUNT_MODES,
  POINTS_MAX,
  POINTS_MIN,
  STATUS_LABEL,
  THEME_COLORS,
  durationOf,
  huntActions,
  huntProblems,
  pointProblems,
  type Hunt,
  type HuntAction,
  type HuntDraft,
  type HuntLive,
  type HuntMode,
  type HuntPatch,
  type HuntPoint,
  type PointInput,
  type ThemeKey,
} from "../schemas";
import { GameGateNotice } from "./gate-notice";

const MODES = [
  { value: "ordered", label: "In order" },
  { value: "free", label: "Any order" },
] as const satisfies readonly { value: HuntMode; label: string }[];

const draftOf = (h: Hunt): HuntDraft => ({
  duration: String(durationOf(h) ?? 60),
  starts: toLocalInput(h.starts_at),
  mode: h.mode,
  bonusN: String(h.bonus_n),
  bonusPts: String(h.bonus_pts),
  hintCost: String(h.hint_cost),
});

/** What a save sends: only what changed. */
export function huntPatch(h: Hunt, d: HuntDraft): HuntPatch {
  const out: HuntPatch = {};
  const dur = Number(d.duration);
  if (dur !== (durationOf(h) ?? 60)) out.duration_minutes = dur;
  if (d.starts !== toLocalInput(h.starts_at)) out.starts_at = fromLocalInput(d.starts);
  if (d.mode !== h.mode) out.mode = d.mode;
  if (Number(d.bonusN) !== h.bonus_n) out.bonus_n = Number(d.bonusN);
  if (Number(d.bonusPts) !== h.bonus_pts) out.bonus_pts = Number(d.bonusPts);
  if (Number(d.hintCost) !== h.hint_cost) out.hint_cost = Number(d.hintCost);
  return out;
}

function SettingsForm({ eventId, h, canEdit }: { eventId: number; h: Hunt; canEdit: boolean }) {
  const save = useSaveHunt(eventId);
  const [draft, setDraft] = React.useState<HuntDraft>(() => draftOf(h));
  const [seen, setSeen] = React.useState(JSON.stringify(h));
  if (JSON.stringify(h) !== seen) {
    setSeen(JSON.stringify(h));
    setDraft(draftOf(h));
  }
  const id = React.useId();
  const set = <K extends keyof HuntDraft>(k: K, v: HuntDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const problems = huntProblems(draft);
  const patch = huntPatch(h, draft);
  const dirty = Object.keys(patch).length > 0;
  const blocked = Object.keys(problems).length > 0;

  const submit = async () => {
    if (!dirty || blocked) return;
    try {
      await save.mutateAsync(patch);
      toast.success("Hunt settings saved");
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  const num = (k: "duration" | "bonusN" | "bonusPts" | "hintCost", label: string, hint: string, width = "w-28") => (
    <div>
      <label htmlFor={`${id}-${k}`} className="eyebrow mb-1.5 block">
        {label}
      </label>
      <input id={`${id}-${k}`} type="number" inputMode="numeric" min={0} className={cn("input", width)} value={draft[k]} onChange={(e) => set(k, e.target.value)} />
      <p className={cn("mt-1 text-[11.5px] leading-[1.5]", problems[k] ? "text-refuse" : "text-ink-3")}>{problems[k] ?? hint}</p>
    </div>
  );

  return (
    <form
      className="border-line-soft grid gap-4 border-t p-4 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <fieldset disabled={!canEdit} className="contents">
        {num("duration", "Length in minutes", `Players have ${lengthText(Number(draft.duration) || 0)} once it starts.`)}
        <div>
          <label htmlFor={`${id}-start`} className="eyebrow mb-1.5 block">
            Start time
          </label>
          <input id={`${id}-start`} type="datetime-local" className="input w-auto" value={draft.starts} onChange={(e) => set("starts", e.target.value)} />
          <p className="text-ink-3 mt-1 text-[11.5px] leading-[1.5]">Empty: it starts when you press Start.</p>
        </div>
        <div>
          <span className="eyebrow mb-1.5 block">Clue order</span>
          <Segmented label="Clue order" value={draft.mode} options={MODES} onChange={(v) => set("mode", v)} />
          <p className="text-ink-3 mt-1 text-[11.5px] leading-[1.5]">
            {draft.mode === "ordered" ? "Each player follows their own chain of clues, starting at a different place so the crowd spreads out." : "Every clue is listed and players choose the order."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {num("bonusN", "Early bonus: first", "players to find each code get the bonus.", "w-24")}
          {num("bonusPts", "Early bonus: points", "added to that code.", "w-24")}
        </div>
        {num("hintCost", "Hint cost", "points taken when a player buys a hint. Scores never go below 0.")}
      </fieldset>
      {canEdit ? (
        <div className="border-line-soft flex items-center justify-end gap-2 border-t pt-3 md:col-span-2" role="region" aria-label="Save hunt settings">
          {dirty ? (
            <Button type="button" variant="ghost" onClick={() => setDraft(draftOf(h))}>
              Undo changes
            </Button>
          ) : null}
          <Button type="submit" disabled={!dirty || blocked || save.isPending}>
            {save.isPending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

const STATUS_TONE = { draft: "default", scheduled: "info", live: "success", paused: "warning", ended: "default" } as const;

/** Start, pause, resume, end and extend, as the hunt's state allows. */
export function StateBar({ eventId, h, points, canEdit }: { eventId: number; h: Hunt; points: number; canEdit: boolean }) {
  const act = useHuntAction(eventId);
  const [confirmEnd, setConfirmEnd] = React.useState(false);
  const [extend, setExtend] = React.useState(false);
  const [minutes, setMinutes] = React.useState("10");
  const run = (action: HuntAction, mins?: number) =>
    act.mutate(
      { action, minutes: mins },
      {
        onSuccess: () => {
          setConfirmEnd(false);
          setExtend(false);
          toast.success(action === "start" ? "The hunt has started" : action === "pause" ? "The hunt is paused" : action === "resume" ? "The hunt is back on" : action === "end" ? "The hunt has ended" : `Added ${mins} minutes`);
        },
      },
    );
  const mins = Number(minutes);
  const minsOk = Number.isInteger(mins) && mins >= 1 && mins <= 240;
  return (
    <div className="flex flex-wrap items-center gap-3 p-4">
      <span className="min-w-0">
        <span className="text-ink flex items-center gap-2 text-[15px] font-semibold">
          Scavenger Hunt <StatusBadge tone={STATUS_TONE[h.status]} label={STATUS_LABEL[h.status]} />
        </span>
        <span className="text-ink-3 mt-0.5 block text-[12.5px] leading-[1.5]">
          {h.status === "ended" ? "Over: the final board is locked. Extend to reopen it." : h.status === "paused" ? "Paused: scans are refused until you resume." : h.status === "live" ? "Live: players are scanning now." : `${plural(points, "QR point")} placed. Starting needs at least one.`}
        </span>
      </span>
      {canEdit ? (
        <span className="ml-auto flex flex-wrap gap-2">
          {huntActions(h.status).map((a) => (
            <Button
              key={a}
              variant={a === "start" || a === "resume" ? "primary" : a === "end" ? "secondary" : "secondary"}
              disabled={act.isPending || (a === "start" && points === 0)}
              onClick={() => (a === "end" ? setConfirmEnd(true) : a === "extend" ? setExtend(true) : run(a))}
            >
              {ACTION_LABEL[a]}
            </Button>
          ))}
        </span>
      ) : null}

      <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End the hunt?</AlertDialogTitle>
            <AlertDialogDescription>Scans stop and the final board is locked. You can still extend it afterwards if you end it by mistake.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Keep it going</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                run("end");
              }}
            >
              End the hunt
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={extend} onOpenChange={setExtend}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Extend the hunt</DialogTitle>
            <DialogDescription>Adds time to the end. On an ended hunt it opens it again.</DialogDescription>
          </DialogHeader>
          <div>
            <label htmlFor="games-extend" className="eyebrow mb-1.5 block">
              Minutes to add
            </label>
            <input id="games-extend" type="number" inputMode="numeric" min={1} max={240} className="input w-28" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            <p className={cn("mt-1 text-[11.5px]", minsOk ? "text-ink-3" : "text-refuse")}>{minsOk ? "Up to 240." : "A whole number from 1 to 240."}</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExtend(false)}>
              Cancel
            </Button>
            <Button disabled={!minsOk || act.isPending} onClick={() => run("extend", mins)}>
              Add time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** A phone showing one clue as a player sees it. */
export function CluePhone({ clue, number, points, theme }: { clue: string; number: number | null; points: number; theme: ThemeKey }) {
  const c = THEME_COLORS[theme];
  return (
    <div role="group" aria-label="Phone preview of the clue" className="mx-auto w-[210px] rounded-[28px] border-[6px] border-black p-3" style={{ background: c.bg, color: c.ink, fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>
      <p className="m-0 text-[9px] uppercase" style={{ color: c.mute, letterSpacing: ".1em" }}>
        Your clue{number ? ` · find ${number}` : ""}
      </p>
      <p data-slot="clue-text" className="m-0 mt-2 min-h-[84px] text-[14px] leading-snug font-semibold" style={{ fontFamily: "var(--font-unbounded), system-ui, sans-serif" }}>
        {clue.trim() || "The clue you write shows here."}
      </p>
      <div className="mt-3 flex items-center justify-between text-[10px]">
        <span className="rounded-full px-2 py-0.5 font-bold" style={{ background: c.accent, color: c.bg }}>
          +{points} pts
        </span>
        <span style={{ color: c.mute }}>Scan the code</span>
      </div>
    </div>
  );
}

const emptyPoint: PointInput = { label: "", clue: "", zone: "", base_points: POINTS_MIN, hint: "" };
const pointInputOf = (p: HuntPoint): PointInput => ({ label: p.label, clue: p.clue, zone: p.zone, base_points: p.base_points, hint: p.hint });

function PointEditor({ eventId, point, theme, canEdit, onDone }: { eventId: number; point: HuntPoint | null; theme: ThemeKey; canEdit: boolean; onDone: (id: string | null) => void }) {
  const create = useCreatePoint(eventId);
  const update = useUpdatePoint(eventId);
  const remove = useDeletePoint(eventId);
  const [d, setD] = React.useState<PointInput>(() => (point ? pointInputOf(point) : emptyPoint));
  const [pts, setPts] = React.useState(String(d.base_points));
  const id = React.useId();
  const input: PointInput = { ...d, base_points: pts.trim() === "" ? NaN : Number(pts) };
  const problems = pointProblems(input);
  const blocked = Object.keys(problems).length > 0;
  const dirty = !point || JSON.stringify(pointInputOf(point)) !== JSON.stringify(input);
  const busy = create.isPending || update.isPending;
  const clean: PointInput = { label: input.label.trim(), clue: input.clue.trim(), zone: input.zone.trim(), base_points: input.base_points, hint: input.hint.trim() };

  const submit = async () => {
    if (blocked || !dirty) return;
    try {
      if (point) {
        await update.mutateAsync({ pointId: point.id, body: clean });
        toast.success("QR point saved");
        onDone(point.id);
      } else {
        const made = await create.mutateAsync(clean);
        toast.success("QR point added");
        onDone(made.id);
      }
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  const field = (k: "label" | "zone", label: string, hint: string, ph: string) => (
    <div>
      <label htmlFor={`${id}-${k}`} className="eyebrow mb-1.5 block">
        {label}
      </label>
      <input id={`${id}-${k}`} className="input" value={d[k]} placeholder={ph} onChange={(e) => setD((x) => ({ ...x, [k]: e.target.value }))} />
      <p className={cn("mt-1 text-[11.5px]", problems[k] ? "text-refuse" : "text-ink-3")}>{problems[k] ?? hint}</p>
    </div>
  );
  return (
    <form
      className="grid gap-3.5 sm:grid-cols-[minmax(0,1fr)_230px]"
      aria-label={point ? `QR point ${point.number}` : "New QR point"}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <fieldset disabled={!canEdit} className="grid content-start gap-3.5">
        {field("label", "Placed at", "Where the code is stuck up. It is printed under the QR, never the clue.", "Registration desk pillar")}
        <div>
          <label htmlFor={`${id}-clue`} className="eyebrow mb-1.5 block">
            Clue
          </label>
          <textarea id={`${id}-clue`} className="input min-h-[72px]" rows={3} value={d.clue} onChange={(e) => setD((x) => ({ ...x, clue: e.target.value }))} />
          <p className={cn("mt-1 text-[11.5px]", problems.clue ? "text-refuse" : "text-ink-3")}>{problems.clue ?? `${d.clue.trim().length} of ${CLUE_MAX}. What the player reads to find this code.`}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {field("zone", "Zone", "Optional: a hall or area. Used to spot fast claims.", "Hall B")}
          <div>
            <label htmlFor={`${id}-pts`} className="eyebrow mb-1.5 block">
              Points
            </label>
            <input id={`${id}-pts`} type="number" inputMode="numeric" className="input w-24" value={pts} onChange={(e) => setPts(e.target.value)} />
            <p className={cn("mt-1 text-[11.5px]", problems.base_points ? "text-refuse" : "text-ink-3")}>{problems.base_points ?? `${POINTS_MIN} to ${POINTS_MAX}.`}</p>
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-hint`} className="eyebrow mb-1.5 block">
            Hint
          </label>
          <input id={`${id}-hint`} className="input" value={d.hint} onChange={(e) => setD((x) => ({ ...x, hint: e.target.value }))} />
          <p className={cn("mt-1 text-[11.5px]", problems.hint ? "text-refuse" : "text-ink-3")}>{problems.hint ?? `Optional, ${d.hint.trim().length} of ${HINT_MAX}. A player pays points to read it.`}</p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={blocked || !dirty || busy}>
              {busy ? "Saving…" : point ? "Save QR point" : "Add QR point"}
            </Button>
            {point ? (
              <Button
                type="button"
                variant="ghost"
                className="text-refuse"
                disabled={remove.isPending}
                aria-label={`Delete QR point ${point.number}`}
                onClick={() => remove.mutate(point.id, { onSuccess: () => onDone(null) })}
              >
                <Trash2Icon /> Delete
              </Button>
            ) : null}
          </div>
        ) : null}
      </fieldset>
      <div className="grid content-start gap-2">
        <span className="eyebrow">Phone preview</span>
        <CluePhone clue={d.clue} number={point?.number ?? null} points={Number.isFinite(input.base_points) ? input.base_points : POINTS_MIN} theme={theme} />
      </div>
    </form>
  );
}

export function PointsPanel({ eventId, h, points, canEdit, theme, hasPdf }: { eventId: number; h: Hunt; points: HuntPoint[]; canEdit: boolean; theme: ThemeKey; hasPdf: boolean }) {
  const [selected, setSelected] = React.useState<string | "new" | null>(null);
  const current = selected && selected !== "new" ? (points.find((p) => p.id === selected) ?? null) : null;
  return (
    <FigurePanel className="p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <span className="min-w-0">
          <span className="text-ink block text-[15px] font-semibold">QR points</span>
          <span className="text-ink-3 mt-0.5 block text-[12.5px] leading-[1.5]">
            {h.mode === "ordered" ? "Clues are given in a chain, each player starting at a different point." : "Players see every clue."} Select a row to change it.
          </span>
        </span>
        <span className="flex flex-wrap gap-2">
          {hasPdf ? (
            <a className={cn("btn btn-secondary", points.length === 0 && "pointer-events-none opacity-50")} href={pointsPdfUrl(eventId)} target="_blank" rel="noreferrer" aria-disabled={points.length === 0}>
              <PrinterIcon /> Print QR codes
            </a>
          ) : null}
          {canEdit ? (
            <Button onClick={() => setSelected("new")}>
              <PlusIcon /> Add a QR point
            </Button>
          ) : null}
        </span>
      </div>
      <div className="border-line-soft overflow-x-auto border-t">
        {points.length ? (
          <table className="w-full text-[13px]" aria-label="QR points">
            <thead>
              <tr className="text-ink-3 text-left text-[11.5px]">
                <th className="px-4 py-2 font-medium">No.</th>
                <th className="px-2 py-2 font-medium">Placed at</th>
                <th className="px-2 py-2 font-medium">Zone</th>
                <th className="px-2 py-2 text-right font-medium">Points</th>
                <th className="px-4 py-2 text-right font-medium">Scans</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.id} className={cn("border-line-soft cursor-pointer border-t", selected === p.id && "bg-brand-soft")} aria-selected={selected === p.id} onClick={() => setSelected(p.id)}>
                  <td className="px-4 py-2 tabular-nums">
                    <button type="button" className="font-semibold underline-offset-2 hover:underline" aria-label={`Open QR point ${p.number}`} onClick={() => setSelected(p.id)}>
                      {p.number}
                    </button>
                  </td>
                  <td className="px-2 py-2">{p.label}</td>
                  <td className="text-ink-2 px-2 py-2">{p.zone || "–"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{p.base_points}</td>
                  <td className="px-4 py-2 text-right tabular-nums" data-slot="scans">
                    {formatNumber(p.scans)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-ink-3 m-0 p-4 text-[13px]">No QR points yet. Add the places you will stick codes, each with a clue.</p>
        )}
      </div>
      {selected ? (
        <div className="border-line-soft border-t p-4">
          <PointEditor key={selected} eventId={eventId} point={current} theme={theme} canEdit={canEdit} onDone={(id) => setSelected(id)} />
        </div>
      ) : null}
    </FigurePanel>
  );
}

export function HuntLivePanel({ live }: { live: HuntLive }) {
  return (
    <FigurePanel className="p-0">
      <div className="p-4">
        <span className="text-ink block text-[15px] font-semibold">Live scans</span>
        <span className="text-ink-3 mt-0.5 block text-[12.5px]">Refreshes every 5 seconds while this page is open.</span>
      </div>
      <div className="border-line-soft grid gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Players", live.players],
          ["Scans", live.scans],
          ["Finds", live.claims],
          ["Finished every point", live.finishers],
        ].map(([label, n]) => (
          <div key={label as string} className="border-line-soft rounded-xl border p-3">
            <p className="text-ink-3 m-0 text-[11.5px]">{label}</p>
            <p className="m-0 mt-0.5 text-[22px] font-semibold tabular-nums">{formatNumber(n as number)}</p>
          </div>
        ))}
      </div>
      <div className="border-line-soft grid gap-4 border-t p-4 md:grid-cols-2">
        <section aria-label="Flagged claims">
          <h3 className="m-0 flex items-center gap-1.5 text-[13px] font-semibold">
            <FlagIcon className="text-caution size-3.5" aria-hidden="true" /> Flagged fast claims
          </h3>
          <p className="text-ink-3 mt-0.5 text-[11.5px] leading-[1.5]">Players who found 3 or more points in different zones within a minute. A photographed code works, so look before you act.</p>
          {live.flags.length ? (
            <ul className="m-0 mt-2 grid list-none gap-1.5 p-0 text-[13px]">
              {live.flags.map((f) => (
                <li key={f.registration_id} className="border-line-soft rounded-lg border px-2.5 py-1.5">
                  <span className="font-medium">{f.name || "A player"}</span>
                  <span className="text-ink-2"> · {plural(f.claims, "find")} in {f.zones.length ? f.zones.join(", ") : "different zones"}</span>
                  {f.first_at ? <span className="text-ink-3"> · from {new Date(f.first_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-3 m-0 mt-2 text-[13px]">Nothing flagged.</p>
          )}
        </section>
        <section aria-label="Recent finds">
          <h3 className="m-0 text-[13px] font-semibold">Recent finds</h3>
          {live.recent.length ? (
            <ul className="m-0 mt-2 grid list-none gap-1 p-0 text-[13px]">
              {live.recent.map((r, i) => (
                <li key={i} className="text-ink-2">
                  <span className="text-ink font-medium">{r.name}</span> found a code
                  {r.at ? <span className="text-ink-3 tabular-nums"> · {new Date(r.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-3 m-0 mt-2 text-[13px]">No finds yet.</p>
          )}
        </section>
      </div>
    </FigurePanel>
  );
}

/** The Scavenger Hunt tab: state, settings, QR points with the phone preview, and what is happening. */
export function HuntPanel({ eventId, canEdit, locked, theme }: { eventId: number; canEdit: boolean; locked: boolean; theme: ThemeKey }) {
  const hunt = useHunt(eventId);
  const points = usePoints(eventId);
  const live = useHuntLive(eventId);
  const editable = canEdit && !locked;
  const list = React.useMemo(() => points.data ?? [], [points.data]);
  // Per-point counts ride on the live feed too: whichever is fresher.
  const counted = React.useMemo(() => {
    const byId = new Map((live.data?.points ?? []).map((p) => [p.id, p.scans]));
    return list.map((p) => ({ ...p, scans: byId.get(p.id) ?? p.scans }));
  }, [list, live.data]);
  return (
    <div className="flex flex-col gap-3.5">
      <GameGateNotice kind="hunt" eventId={eventId} />
      {hunt.isPending ? (
        <Skeleton className="h-[320px] rounded-2xl" />
      ) : hunt.data ? (
        <>
          <FigurePanel className="p-0">
            <StateBar eventId={eventId} h={hunt.data} points={list.length} canEdit={editable} />
            <SettingsForm eventId={eventId} h={hunt.data} canEdit={editable} />
          </FigurePanel>
          <PointsPanel eventId={eventId} h={hunt.data} points={counted} canEdit={editable} theme={theme} hasPdf />
        </>
      ) : (
        <Notice tone="caution">Could not load the hunt.</Notice>
      )}
      {live.data ? <HuntLivePanel live={live.data} /> : null}
    </div>
  );
}
