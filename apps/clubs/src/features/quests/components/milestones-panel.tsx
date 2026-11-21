"use client";

import * as React from "react";
import Link from "next/link";
import { GiftIcon, PencilIcon, PlusIcon, RotateCcwIcon, ShirtIcon, Trash2Icon, TrophyIcon } from "lucide-react";
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
  EmptyState,
  FigurePanel,
  IconButton,
  NativeSelect,
  Notice,
  ProgressBar,
  cn,
  toast,
} from "@moa/ui";

import { errorCodeOf } from "../lib/time";
import { useAddReward, useCreateMilestone, useDeleteMilestone, useDeleteReward, useReofferReward, useUpdateMilestone, useUpdateReward } from "../queries";
import { SOLD_OUT_MODES, type QuestAdmin, type QuestMilestone, type QuestReward, type SoldOutMode, type SwagItem } from "../schemas";

export const SOLD_OUT_META: Record<SoldOutMode, { label: string; hint: string }> = {
  first_come: { label: "First come, first served", hint: "When none is left, the milestone shows it sold out." },
  waitlist: { label: "Unlocked — reserve your size", hint: "When none is left, guests join a waiting list and get the next one freed, in order." },
};

/** "3 tasks done" or "40 points". */
export const thresholdText = (q: Pick<QuestAdmin, "mode">, threshold: number) => (q.mode === "points" ? plural(threshold, "point") : `${plural(threshold, "task")} done`);

/** What is wrong with a threshold as typed. */
export function thresholdProblem(q: Pick<QuestAdmin, "mode" | "tasks">, value: string): string | null {
  const n = Number(value);
  if (!value.trim() || !Number.isInteger(n) || n < 1) return "A whole number, 1 or more.";
  if (q.mode === "checkmarks" && q.tasks.length > 0 && n > q.tasks.length) return `There are only ${plural(q.tasks.length, "task")}: nobody could reach it.`;
  if (q.mode === "points") {
    const most = q.tasks.reduce((s, t) => s + t.points, 0);
    if (q.tasks.length > 0 && n > most) return `All the tasks together are worth ${formatNumber(most)} points: nobody could reach it.`;
  }
  return null;
}

/** Items already a reward somewhere in this quest (an item can be one reward only). */
export function takenItems(q: QuestAdmin): Set<string> {
  return new Set(q.milestones.flatMap((m) => m.rewards.map((r) => r.merch_item_id)));
}

/**
 * A reward picked with nothing free to hold: the API accepts it (stock can be
 * added later under Swag), but everyone who unlocks it before then is put on
 * the waiting list, or finds it sold out. Said plainly, and the form asks
 * before adding it. Null when there is stock (or the server didn't say).
 */
export function noStockWarning(item: { free: number | null; stock?: { total: number } | undefined } | undefined, mode: SoldOutMode): string | null {
  if (!item || item.free == null || item.free > 0) return null;
  const what = (item.stock?.total ?? 0) > 0 ? "None of it is free" : "No stock yet";
  return mode === "waitlist"
    ? `${what} — everyone who unlocks this goes on the waiting list until you add stock.`
    : `${what} — everyone who unlocks this finds it sold out (first come, first served: nobody is queued) until you add stock.`;
}

/** "· 12 free", "· no stock yet", "· none free": an item's stock in the picker. */
const freeText = (i: SwagItem) => (i.free == null ? "" : i.free > 0 ? ` · ${formatNumber(i.free)} free` : (i.stock?.total ?? 0) > 0 ? " · none free" : " · no stock yet");

/** The swag items that can still become a reward: not already one. */
export const offerable = (q: QuestAdmin): SwagItem[] => {
  const taken = takenItems(q);
  return q.swag_items.filter((i) => !taken.has(i.id) && !i.reward_id);
};

function Stock({ r }: { r: QuestReward }) {
  const s = r.stock;
  const [open, setOpen] = React.useState(false);
  const c = r.claims;
  return (
    <div className="mt-2">
      <ProgressBar value={s.reserved + s.collected} max={Math.max(s.total, 1)} tone={s.free === 0 ? "caution" : "accent"} height={7} label={`${r.name}: ${s.reserved + s.collected} of ${s.total} taken`} />
      <p className="text-ink-3 mt-1 flex flex-wrap gap-x-3 font-mono text-[11px] tabular-nums">
        <span>{formatNumber(s.total)} in stock</span>
        <span>{formatNumber(s.reserved)} held</span>
        <span>{formatNumber(s.collected)} collected</span>
        <span className={s.free === 0 ? "text-caution" : undefined}>{formatNumber(s.free)} free</span>
        {r.sizes && s.variants.length ? (
          <button type="button" className="text-ink-2 underline underline-offset-2" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Hide sizes" : "By size"}
          </button>
        ) : null}
      </p>
      {open ? (
        <table className="mt-1.5 w-full text-[11.5px]">
          <thead>
            <tr className="text-ink-3 font-mono text-[10px] tracking-[0.06em] uppercase">
              <th className="py-1 text-left font-normal">Size</th>
              <th className="py-1 text-right font-normal">Stock</th>
              <th className="py-1 text-right font-normal">Held</th>
              <th className="py-1 text-right font-normal">Collected</th>
              <th className="py-1 text-right font-normal">Free</th>
            </tr>
          </thead>
          <tbody>
            {s.variants.map((v) => (
              <tr key={v.id || v.label} className="border-line-soft border-t">
                <td className="text-ink py-1">{v.label}</td>
                <td className="text-ink-2 py-1 text-right font-mono tabular-nums">{v.total}</td>
                <td className="text-ink-2 py-1 text-right font-mono tabular-nums">{v.reserved}</td>
                <td className="text-ink-2 py-1 text-right font-mono tabular-nums">{v.collected}</td>
                <td className={cn("py-1 text-right font-mono tabular-nums", v.free === 0 ? "text-caution" : "text-ink")}>{v.free}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {c.needs_size || c.waitlisted || c.sold_out || c.released ? (
        <p className="text-ink-3 mt-1 text-[11.5px]">
          {[
            c.needs_size ? `${formatNumber(c.needs_size)} still to pick a size` : null,
            c.waitlisted ? `${formatNumber(c.waitlisted)} on the waiting list` : null,
            c.sold_out ? `${formatNumber(c.sold_out)} unlocked it sold out` : null,
            c.released ? `${formatNumber(c.released)} released` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

function RewardRow({ eventId, r, canEdit }: { eventId: number; r: QuestReward; canEdit: boolean }) {
  const update = useUpdateReward(eventId);
  const remove = useDeleteReward(eventId);
  const reoffer = useReofferReward(eventId);
  const [confirm, setConfirm] = React.useState(false);
  const uncollected = r.claims.reserved + r.claims.waitlisted;
  return (
    <li className="border-line-soft flex flex-wrap items-start gap-3 border-t px-3 py-3 first:border-t-0">
      {r.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.photo_url} alt="" className="border-line-soft size-10 shrink-0 rounded-lg border object-cover" />
      ) : (
        <span aria-hidden="true" className="bg-brand-soft text-brand grid size-10 shrink-0 place-items-center rounded-lg">
          <ShirtIcon className="size-4" />
        </span>
      )}
      <div className="min-w-[200px] flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-ink text-[13.5px] font-medium">{r.name}</span>
          {r.sizes ? <span className="tag tag-neutral">Sizes</span> : null}
        </div>
        <Stock r={r} />
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <NativeSelect
          aria-label={`When ${r.name} runs out`}
          value={r.sold_out_mode}
          disabled={!canEdit || update.isPending}
          className="w-auto"
          onChange={(e) => {
            const mode = e.target.value as SoldOutMode;
            update.mutate({ rewardId: r.id, mode }, { onSuccess: () => toast.success(`${r.name}: ${SOLD_OUT_META[mode].label.toLowerCase()}`) });
          }}
        >
          {SOLD_OUT_MODES.map((m) => (
            <option key={m} value={m}>
              {SOLD_OUT_META[m].label}
            </option>
          ))}
        </NativeSelect>
        {canEdit ? (
          <span className="flex gap-1">
            {r.claims.sold_out > 0 ? (
              <Button
                size="xs"
                variant="secondary"
                disabled={reoffer.isPending || r.stock.free === 0}
                title={r.stock.free === 0 ? "Nothing is free to offer: add stock under Swag first" : undefined}
                onClick={() =>
                  reoffer.mutate(r.id, {
                    onSuccess: (res) =>
                      toast.success(res.held ? `${plural(res.held, "guest")} now ${res.held === 1 ? "has" : "have"} one held` : "Nothing was free to hold", {
                        description: res.still_sold_out ? `${plural(res.still_sold_out, "guest")} still without one.` : undefined,
                      }),
                  })
                }
              >
                <RotateCcwIcon /> Offer again
              </Button>
            ) : null}
            <IconButton label={`Remove ${r.name}`} size="xs" danger onClick={() => setConfirm(true)}>
              <Trash2Icon />
            </IconButton>
          </span>
        ) : null}
      </div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {r.name} from this milestone?</AlertDialogTitle>
            <AlertDialogDescription>
              {uncollected
                ? `${plural(uncollected, "guest is", "guests are")} waiting for one. Their holds are released and the units go back to stock. Ones already collected stay collected.`
                : "Nobody is waiting for one, so nothing is released."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                remove.mutate(r.id, { onSuccess: () => (setConfirm(false), toast.success(`${r.name} removed`)) });
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function AddReward({ eventId, q, milestone }: { eventId: number; q: QuestAdmin; milestone: QuestMilestone }) {
  const add = useAddReward(eventId);
  const items = offerable(q);
  const [item, setItem] = React.useState("");
  const [mode, setMode] = React.useState<SoldOutMode>("waitlist");
  const [confirming, setConfirming] = React.useState(false);
  const id = React.useId();
  if (q.swag_items.length === 0) return null;
  if (items.length === 0) return <p className="text-ink-3 px-3 pt-2 pb-3 text-[11.5px]">Every swag item is a reward already. An item can be the reward of one milestone.</p>;
  const picked = items.find((i) => i.id === item);
  const warning = noStockWarning(picked, mode);
  const submit = () =>
    add.mutate(
      { milestoneId: milestone.id, body: { merch_item_id: item, sold_out_mode: mode } },
      {
        onSuccess: () => {
          toast.success(`${picked?.name ?? "Reward"} added to ${milestone.title}`, {
            description: warning ? "Add its stock under Swag: units are held for guests as soon as there are some." : "Guests who already reached it have one held now.",
          });
          setItem("");
          setConfirming(false);
        },
        onError: (err) => (errorCodeOf(err) === "QUEST_ITEM_ALREADY_A_REWARD" ? toast.error("That item is already a reward of this quest") : undefined),
      }
    );
  return (
    <form
      className="border-line-soft grid gap-2 border-t px-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (!item) return;
        // Nothing to hold: ask first (the API accepts it, and stock can come later).
        if (warning) setConfirming(true);
        else submit();
      }}
    >
      <div>
        <label htmlFor={`${id}-item`} className="eyebrow mb-1.5 block">
          Add a reward
        </label>
        <NativeSelect id={`${id}-item`} value={item} onChange={(e) => setItem(e.target.value)}>
          <option value="">Pick a swag item</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
              {freeText(i)}
              {i.sizes ? " · sizes" : ""}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div>
        <label htmlFor={`${id}-mode`} className="eyebrow mb-1.5 block">
          When it runs out
        </label>
        <NativeSelect id={`${id}-mode`} value={mode} onChange={(e) => setMode(e.target.value as SoldOutMode)}>
          {SOLD_OUT_MODES.map((m) => (
            <option key={m} value={m}>
              {SOLD_OUT_META[m].label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit" variant="secondary" disabled={!item || add.isPending}>
        <PlusIcon /> Add
      </Button>
      {warning ? (
        <div className="sm:col-span-3">
          <Notice
            tone="caution"
            tag="No stock"
            action={
              <Button asChild size="sm" variant="secondary">
                <Link href={`/events/${eventId}/merch`}>Add stock</Link>
              </Button>
            }
          >
            {warning}
          </Notice>
        </div>
      ) : null}
      <p className="text-ink-3 text-[11.5px] sm:col-span-3">
        {SOLD_OUT_META[mode].hint} A unit is held the moment a guest unlocks the milestone, so the swag desk always has theirs.
      </p>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add {picked?.name ?? "this item"} with no stock?</AlertDialogTitle>
            <AlertDialogDescription>{warning} You can add stock under Swag at any time; units are then held for guests in order.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Not yet</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                submit();
              }}
              disabled={add.isPending}
            >
              Add it anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function MilestoneCard({ eventId, q, m, canEdit }: { eventId: number; q: QuestAdmin; m: QuestMilestone; canEdit: boolean }) {
  const update = useUpdateMilestone(eventId);
  const remove = useDeleteMilestone(eventId);
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(m.title);
  const [threshold, setThreshold] = React.useState(String(m.threshold));
  const [confirm, setConfirm] = React.useState(false);
  const id = React.useId();
  const problem = editing ? thresholdProblem(q, threshold) : null;
  const held = m.rewards.reduce((s, r) => s + r.claims.reserved + r.claims.waitlisted, 0);
  const save = () => {
    const body = {
      ...(title.trim() && title.trim() !== m.title ? { title: title.trim() } : {}),
      ...(Number(threshold) !== m.threshold ? { threshold: Number(threshold) } : {}),
    };
    if (!Object.keys(body).length) return setEditing(false);
    update.mutate(
      { milestoneId: m.id, body },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success(`${body.title ?? m.title} saved`, {
            description: body.threshold && body.threshold > m.threshold ? "Guests below the new threshold lose it, and rewards they had not collected go back to stock." : undefined,
          });
        },
      }
    );
  };
  return (
    <li className="border-line-soft bg-surface overflow-hidden rounded-xl border">
      <div className="bg-sunken/60 flex flex-wrap items-center gap-3 px-3 py-2.5">
        <span aria-hidden="true" className="bg-brand-soft text-brand grid size-8 shrink-0 place-items-center rounded-lg">
          <TrophyIcon className="size-4" />
        </span>
        {editing ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
            <div className="min-w-[160px] flex-1">
              <label htmlFor={`${id}-t`} className="eyebrow mb-1 block">
                Milestone
              </label>
              <input id={`${id}-t`} className="input input-sm" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${id}-n`} className="eyebrow mb-1 block">
                {q.mode === "points" ? "Points" : "Tasks done"}
              </label>
              <input id={`${id}-n`} type="number" min={1} className="input input-sm w-24" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            </div>
            <Button size="sm" disabled={update.isPending || !!problem} onClick={save}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            {problem ? <p className="text-refuse basis-full text-[11.5px]">{problem}</p> : null}
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <span className="text-ink block text-[13.5px] font-semibold">{m.title}</span>
            <span className="text-ink-3 block text-[12px]">At {thresholdText(q, m.threshold)}</span>
          </div>
        )}
        {canEdit && !editing ? (
          <span className="flex gap-1">
            <IconButton label={`Edit ${m.title}`} onClick={() => (setTitle(m.title), setThreshold(String(m.threshold)), setEditing(true))}>
              <PencilIcon />
            </IconButton>
            <IconButton label={`Delete ${m.title}`} danger onClick={() => setConfirm(true)}>
              <Trash2Icon />
            </IconButton>
          </span>
        ) : null}
      </div>
      {m.rewards.length ? (
        <ul>
          {m.rewards.map((r) => (
            <RewardRow key={r.id} eventId={eventId} r={r} canEdit={canEdit} />
          ))}
        </ul>
      ) : (
        <p className="text-ink-3 px-3 py-3 text-[12px]">No reward yet: guests reaching it get a tick and nothing to collect.</p>
      )}
      {canEdit ? <AddReward eventId={eventId} q={q} milestone={m} /> : null}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {m.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its rewards go with it.{" "}
              {held ? `${plural(held, "guest is", "guests are")} waiting for one: their holds are released and the units go back to stock.` : "Nobody is waiting for one."} Rewards already
              collected stay collected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                remove.mutate(m.id, { onSuccess: () => (setConfirm(false), toast.success(`${m.title} deleted`)) });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

/** Milestones (a number of tasks, or points) and the swag each unlocks, with its stock. */
export function MilestonesPanel({ eventId, q, canEdit }: { eventId: number; q: QuestAdmin; canEdit: boolean }) {
  const create = useCreateMilestone(eventId);
  const [title, setTitle] = React.useState("");
  const [threshold, setThreshold] = React.useState("");
  const id = React.useId();
  const problem = threshold ? thresholdProblem(q, threshold) : null;
  const milestones = [...q.milestones].sort((a, b) => a.threshold - b.threshold || a.sort_order - b.sort_order);
  return (
    <FigurePanel className="overflow-hidden p-0">
      <div className="px-4 pt-4">
        <CardLabel right={milestones.length ? <span className="text-ink-3 font-mono text-[11px]">{plural(milestones.length, "milestone")}</span> : null}>Milestones and rewards</CardLabel>
        <p className="text-ink-3 mt-1 text-[12px] leading-[1.5]">
          Reaching one unlocks its rewards: one of each per ticket, from the event&apos;s swag, held from stock at once and handed over at a swag desk.
        </p>
      </div>
      {q.swag_items.length === 0 ? (
        <div className="px-4 pt-3">
          <Notice
            tone="accent"
            tag="Swag"
            action={
              <Button asChild size="sm" variant="secondary">
                <Link href={`/events/${eventId}/merch`}>Open Swag</Link>
              </Button>
            }
          >
            Rewards come from the event&apos;s swag, with its stock and sizes. Add the items there first (switch Swag on in the event&apos;s settings if the tab isn&apos;t there).
          </Notice>
        </div>
      ) : null}
      {milestones.length === 0 ? (
        <EmptyState size="sm" icon={<GiftIcon />} title="No milestones yet" description="For example: Tier 1 at 3 tasks gives a sticker pack, Tier 2 at 6 tasks a T-shirt." />
      ) : (
        <ul className="grid gap-3 p-4">
          {milestones.map((m) => (
            <MilestoneCard key={m.id} eventId={eventId} q={q} m={m} canEdit={canEdit} />
          ))}
        </ul>
      )}
      {canEdit ? (
        <form
          className="border-line-soft bg-sunken/40 grid gap-2 border-t px-4 py-3 sm:grid-cols-[minmax(0,1fr)_140px_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim() || !threshold || problem) return;
            create.mutate(
              { title: title.trim(), threshold: Number(threshold) },
              {
                onSuccess: (m) => {
                  toast.success(`${m.title} added`, { description: "Now add its reward." });
                  setTitle("");
                  setThreshold("");
                },
              }
            );
          }}
        >
          <div>
            <label htmlFor={`${id}-title`} className="eyebrow mb-1.5 block">
              Add a milestone
            </label>
            <input id={`${id}-title`} className="input" value={title} maxLength={80} placeholder="Tier 1" onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${id}-n`} className="eyebrow mb-1.5 block">
              {q.mode === "points" ? "At points" : "At tasks done"}
            </label>
            <input id={`${id}-n`} type="number" min={1} inputMode="numeric" className="input" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </div>
          <Button type="submit" variant="secondary" disabled={!title.trim() || !threshold || !!problem || create.isPending}>
            <PlusIcon /> Add milestone
          </Button>
          {problem ? <p className="text-refuse text-[11.5px] sm:col-span-3">{problem}</p> : null}
        </form>
      ) : null}
    </FigurePanel>
  );
}

