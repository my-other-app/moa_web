"use client";

import * as React from "react";
import { RefreshCwIcon } from "lucide-react";
import { formatNumber, plural } from "@moa/app-kit";
import { Button, EmptyState, Notice, Skeleton, toast } from "@moa/ui";

import { useAccess } from "@/features/access";
import { useEventDetail } from "@/features/events";

import { errorText } from "../lib/time";
import { useQuestAdmin, useQuestTemplates, useRecompute } from "../queries";
import type { QuestAdmin } from "../schemas";
import { GuestsPanel } from "./guests-panel";
import { LivePanel } from "./live-panel";
import { MilestonesPanel } from "./milestones-panel";
import { SettingsPanel } from "./settings-panel";
import { StationsPanel } from "./stations-panel";
import { TasksPanel } from "./tasks-panel";

/** The one line under the heading: what the quest is, as it stands. */
export function questLine(q: QuestAdmin): string {
  const rewards = q.milestones.reduce((s, m) => s + m.rewards.length, 0);
  const parts = [plural(q.tasks.length, "task"), plural(q.milestones.length, "milestone"), plural(rewards, "reward")];
  const stations = q.stations.filter((s) => s.purpose === "station" && s.active).length;
  if (stations) parts.push(plural(stations, "station"));
  return `${q.enabled ? "On" : "Off"} · ${parts.join(" · ")}`;
}

/** What still stands between the quest and guests being able to finish it, said once each. */
export function setupGaps(q: QuestAdmin): string[] {
  const out: string[] = [];
  if (!q.tasks.length) out.push("Add a task: nothing can be done yet.");
  if (!q.milestones.length) out.push("Add a milestone: tasks done unlock nothing yet.");
  else if (!q.milestones.some((m) => m.rewards.length)) out.push("Give a milestone a reward from the event's swag.");
  if (q.milestones.some((m) => m.rewards.length) && !q.stations.some((s) => s.purpose === "swag_desk" && s.active)) out.push("Add a swag desk so guests know where to collect.");
  const stationTasks = q.tasks.filter((t) => t.kind === "station");
  if (stationTasks.some((t) => !q.stations.some((s) => s.id === t.config.door_id && s.active))) out.push("A station task names a station that is retired or gone.");
  return out;
}

/**
 * Event → Quests: guests do tasks (proven by check-ins, scans, codes, the
 * live room or the organiser), reach milestones, and collect the swag each
 * unlocks at a swag desk. The organiser's whole side on one page: the switch
 * (off by default) and settings; the live numbers once it runs; tasks;
 * milestones and rewards with their stock; stations and swag desks with
 * their door links; the guests, with grants and revokes; the export.
 * Changing things is for the owner, admins and editors (and a co-host's
 * team); door staff read it, and don't export.
 */
export function QuestsPage({ eventId }: { eventId: number }) {
  const quest = useQuestAdmin(eventId);
  const templates = useQuestTemplates(eventId);
  const event = useEventDetail(eventId);
  const recompute = useRecompute(eventId);
  const { can } = useAccess();
  const canEdit = Boolean(can.edit_events);
  const canExport = Boolean(can.exports);
  const q = quest.data;
  const eventName = event.data?.name ?? "Event";
  const gaps = q ? setupGaps(q) : [];
  const running = q ? q.enabled || q.tasks.some((t) => t.done_count > 0) : false;

  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em]">Quests</h2>
          <p className="text-ink-2 mt-1 text-[13px]">{q ? questLine(q) : "Tasks guests do at the event, milestones they reach, and the swag each unlocks."}</p>
        </div>
        {q && canEdit && running ? (
          <Button
            variant="secondary"
            disabled={recompute.isPending}
            title="Runs every task's rule again for every guest. Safe to repeat; ticks already given stay."
            onClick={() => recompute.mutate(undefined, { onSuccess: () => toast.success("Counting again", { description: "Every guest's progress is being checked against every task. It takes a minute." }) })}
          >
            <RefreshCwIcon className={recompute.isPending ? "animate-spin motion-reduce:animate-none" : undefined} /> Count again
          </Button>
        ) : null}
      </header>

      {quest.isPending ? (
        <>
          <Skeleton className="h-[220px] rounded-2xl" />
          <Skeleton className="h-[320px] rounded-2xl" />
        </>
      ) : quest.isError ? (
        <EmptyState
          tone="muted"
          title="Could not load the quest"
          description={errorText(quest.error)}
          action={
            <Button variant="secondary" size="sm" onClick={() => void quest.refetch()}>
              Try again
            </Button>
          }
        />
      ) : !q ? (
        <EmptyState tone="muted" title="Quests are not here yet" description="Tasks, milestones and swag rewards for guests come with the next update of MyOtherApp." />
      ) : (
        <>
          {!canEdit ? (
            <Notice tone="neutral" tag="Read only">
              Your role can see the quest and its numbers; changing it, granting tasks and exporting are for the club&apos;s owner, admins and editors.
            </Notice>
          ) : null}
          <SettingsPanel eventId={eventId} q={q} canEdit={canEdit} />
          {gaps.length && canEdit ? (
            <Notice tone={q.enabled ? "caution" : "accent"} tag="Set up">
              <ul className="grid gap-0.5">
                {gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
          {running ? <LivePanel eventId={eventId} q={q} /> : null}
          <TasksPanel eventId={eventId} q={q} templates={templates.data} canEdit={canEdit} eventName={eventName} />
          <div className="grid items-start gap-3.5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <MilestonesPanel eventId={eventId} q={q} canEdit={canEdit} />
            <StationsPanel eventId={eventId} q={q} canEdit={canEdit} />
          </div>
          {running ? <GuestsPanel eventId={eventId} q={q} canEdit={canEdit} canExport={canExport} /> : null}
          {!running && q.tasks.length ? (
            <p className="text-ink-3 text-[12px]">
              Guests and the live numbers show here once the quest is on. {formatNumber(q.tasks.length)} {q.tasks.length === 1 ? "task is" : "tasks are"} ready.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
