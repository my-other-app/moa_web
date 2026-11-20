"use client";

import * as React from "react";
import { plural } from "@moa/app-kit";
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
  FigurePanel,
  NativeSelect,
  Segmented,
  StatusBadge,
  Switch,
  Textarea,
  toast,
} from "@moa/ui";

import { errorText, fromLocalInput, toLocalInput } from "../lib/time";
import { useSaveQuest } from "../queries";
import {
  ATTEMPTS_MAX,
  ATTEMPTS_MIN,
  INTRO_MAX,
  TITLE_MAX,
  type LeaderboardNames,
  type QuestAdmin,
  type QuestMode,
  type QuestSettingsPatch,
} from "../schemas";

const MODES = [
  { value: "checkmarks", label: "Checkmarks" },
  { value: "points", label: "Points" },
] as const satisfies readonly { value: QuestMode; label: string }[];

interface Draft {
  title: string;
  intro: string;
  mode: QuestMode;
  starts: string;
  ends: string;
  leaderboard: boolean;
  names: LeaderboardNames;
  attempts: string;
}

const draftOf = (q: QuestAdmin): Draft => ({
  title: q.title,
  intro: q.intro,
  mode: q.mode,
  starts: toLocalInput(q.starts_at),
  ends: toLocalInput(q.ends_at),
  leaderboard: q.leaderboard,
  names: q.leaderboard_names,
  attempts: String(q.code_attempts_per_hour),
});

/** What would be sent: only what changed. */
export function settingsPatch(q: QuestAdmin, d: Draft): QuestSettingsPatch {
  const out: QuestSettingsPatch = {};
  if (d.title.trim() !== q.title) out.title = d.title.trim();
  if (d.intro.trim() !== q.intro) out.intro = d.intro.trim();
  if (d.mode !== q.mode) out.mode = d.mode;
  if (d.starts !== toLocalInput(q.starts_at)) out.starts_at = fromLocalInput(d.starts);
  if (d.ends !== toLocalInput(q.ends_at)) out.ends_at = fromLocalInput(d.ends);
  if (d.leaderboard !== q.leaderboard) out.leaderboard = d.leaderboard;
  if (d.names !== q.leaderboard_names) out.leaderboard_names = d.names;
  const attempts = Number(d.attempts);
  if (attempts !== q.code_attempts_per_hour) out.code_attempts_per_hour = attempts;
  return out;
}

/** What is wrong with the settings as written. */
export function settingsProblems(d: Draft): Partial<Record<keyof Draft, string>> {
  const out: Partial<Record<keyof Draft, string>> = {};
  if (d.title.trim().length > TITLE_MAX) out.title = `At most ${TITLE_MAX} characters.`;
  if (d.intro.trim().length > INTRO_MAX) out.intro = `At most ${INTRO_MAX} characters.`;
  if (d.starts && d.ends && new Date(d.ends) <= new Date(d.starts)) out.ends = "It must end after it starts.";
  const a = Number(d.attempts);
  if (!Number.isInteger(a) || a < ATTEMPTS_MIN || a > ATTEMPTS_MAX) out.attempts = `A whole number from ${ATTEMPTS_MIN} to ${ATTEMPTS_MAX}.`;
  return out;
}

/**
 * The switch (off by default: guests see nothing and nothing is counted)
 * and how the quest runs: its name and line for guests, checkmarks or
 * points, its hours, the leaderboard and how wrong codes are limited.
 */
export function SettingsPanel({ eventId, q, canEdit }: { eventId: number; q: QuestAdmin; canEdit: boolean }) {
  const save = useSaveQuest(eventId);
  const [confirmOff, setConfirmOff] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(() => draftOf(q));
  // A save (here or elsewhere) brings fresh settings: start again from them.
  const [seen, setSeen] = React.useState(q.updated_at);
  if (q.updated_at !== seen) {
    setSeen(q.updated_at);
    setDraft(draftOf(q));
  }
  const id = React.useId();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const patch = settingsPatch(q, draft);
  const problems = settingsProblems(draft);
  const dirty = Object.keys(patch).length > 0;
  const required = q.tasks.filter((t) => t.required).length;

  const toggle = async (enabled: boolean) => {
    try {
      await save.mutateAsync({ enabled });
      setConfirmOff(false);
      toast.success(enabled ? "Quests are on" : "Quests are off", {
        description: enabled
          ? "Guests see the quest on the event page and their ticket. What they already did (checked in, followed, met people) is being counted now."
          : "Nothing is counted while it is off. Everyone's progress and rewards are kept, and rewards already held can still be handed over.",
      });
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  const submit = async () => {
    if (!dirty || Object.keys(problems).length) return;
    try {
      await save.mutateAsync(patch);
      toast.success("Quest settings saved");
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  return (
    <FigurePanel className="p-0">
      <div className="flex items-start justify-between gap-3 p-4">
        <span className="min-w-0">
          <span className="text-ink flex items-center gap-2 text-[15px] font-semibold">
            Quests <StatusBadge tone={q.enabled ? "success" : "default"} label={q.enabled ? "On" : "Off"} />
          </span>
          <span className="text-ink-3 mt-0.5 block text-[12.5px] leading-[1.5]">
            {q.enabled
              ? "Guests see the quest on the event page and their ticket: the tasks, their progress, the rewards and where to collect them. Tasks are proven by what happens (check-ins, scans, codes, staff), never ticked by the guest."
              : "Off: guests see nothing and nothing is counted. Set up tasks and rewards first, then switch it on; check-in, payments and tickets work exactly as before either way."}
          </span>
        </span>
        <Switch
          checked={q.enabled}
          disabled={!canEdit || save.isPending}
          aria-label="Quests"
          onCheckedChange={(on) => (on ? void toggle(true) : setConfirmOff(true))}
        />
      </div>

      <form
        className="border-line-soft grid gap-4 border-t p-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset disabled={!canEdit} className="contents">
          <div>
            <label htmlFor={`${id}-title`} className="eyebrow mb-1.5 block">
              Name guests see
            </label>
            <input id={`${id}-title`} className="input" value={draft.title} maxLength={TITLE_MAX} placeholder="DevFest Quest" onChange={(e) => set("title", e.target.value)} />
            {problems.title ? <p className="text-refuse mt-1 text-[11.5px]">{problems.title}</p> : null}
          </div>
          <div>
            <span className="eyebrow mb-1.5 block">Scoring</span>
            <Segmented label="Scoring" value={draft.mode} options={MODES} onChange={(v) => set("mode", v)} />
            <p className="text-ink-3 mt-1.5 text-[11.5px] leading-[1.5]">
              {draft.mode === "points"
                ? "Each task is worth its points; milestones are points totals."
                : "Every task counts one tick; milestones are a number of tasks done."}
              {draft.mode !== q.mode ? " Changing it changes what the milestones count: check their thresholds." : ""}
            </p>
          </div>
          <div className="md:col-span-2">
            <label htmlFor={`${id}-intro`} className="eyebrow mb-1.5 block">
              One line for guests
            </label>
            <Textarea id={`${id}-intro`} rows={2} value={draft.intro} maxLength={INTRO_MAX} placeholder="Do five things around the venue and win a T-shirt." onChange={(e) => set("intro", e.target.value)} />
            {problems.intro ? <p className="text-refuse mt-1 text-[11.5px]">{problems.intro}</p> : null}
          </div>
          <div>
            <span className="eyebrow mb-1.5 block">When it counts</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <input type="datetime-local" aria-label="Quest starts" className="input w-auto" value={draft.starts} onChange={(e) => set("starts", e.target.value)} />
              <span className="text-ink-3 text-[11px]">to</span>
              <input type="datetime-local" aria-label="Quest ends" className="input w-auto" value={draft.ends} onChange={(e) => set("ends", e.target.value)} />
            </div>
            <p className={problems.ends ? "text-refuse mt-1 text-[11.5px]" : "text-ink-3 mt-1 text-[11.5px]"}>
              {problems.ends ?? "Empty: no limit on that side. Nothing is credited outside these hours; station visits are still recorded."}
            </p>
          </div>
          <div>
            <label htmlFor={`${id}-attempts`} className="eyebrow mb-1.5 block">
              Wrong codes allowed per hour
            </label>
            <input id={`${id}-attempts`} type="number" inputMode="numeric" min={ATTEMPTS_MIN} max={ATTEMPTS_MAX} className="input w-28" value={draft.attempts} onChange={(e) => set("attempts", e.target.value)} />
            <p className={problems.attempts ? "text-refuse mt-1 text-[11.5px]" : "text-ink-3 mt-1 text-[11.5px]"}>
              {problems.attempts ?? "Per ticket, so nobody can guess secret codes one after another."}
            </p>
          </div>
          <div className="md:col-span-2 flex flex-wrap items-start gap-x-6 gap-y-3">
            <label className="flex items-start gap-2.5">
              <Switch checked={draft.leaderboard} aria-label="Leaderboard" onCheckedChange={(v) => set("leaderboard", v)} />
              <span className="min-w-0">
                <span className="text-ink block text-[13px] font-medium">Leaderboard</span>
                <span className="text-ink-3 block text-[11.5px] leading-[1.5]">
                  Off by default. On: guests see their rank and the top of the board, and the live big screen can show it.
                </span>
              </span>
            </label>
            {draft.leaderboard ? (
              <div>
                <label htmlFor={`${id}-names`} className="eyebrow mb-1.5 block">
                  Names on the board
                </label>
                <NativeSelect id={`${id}-names`} value={draft.names} onChange={(e) => set("names", e.target.value as LeaderboardNames)} className="w-auto">
                  <option value="initial">First name and initial (Asha K.)</option>
                  <option value="full">Full names</option>
                </NativeSelect>
              </div>
            ) : null}
          </div>
        </fieldset>
        <div className="border-line-soft flex flex-wrap items-center gap-3 border-t pt-3 md:col-span-2" role="region" aria-label="Save">
          <CardLabel>
            {required
              ? `${plural(required, "required task")}: every one must be done before any reward unlocks.`
              : "No required tasks: any tasks count towards a milestone. Mark a task required to make it a must."}
          </CardLabel>
          {canEdit ? (
            <span className="ml-auto flex gap-2">
              {dirty ? (
                <Button type="button" variant="ghost" onClick={() => setDraft(draftOf(q))}>
                  Undo changes
                </Button>
              ) : null}
              <Button type="submit" disabled={!dirty || save.isPending || Object.keys(problems).length > 0}>
                {save.isPending ? "Saving…" : "Save settings"}
              </Button>
            </span>
          ) : null}
        </div>
      </form>

      <AlertDialog open={confirmOff} onOpenChange={setConfirmOff}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch quests off?</AlertDialogTitle>
            <AlertDialogDescription>
              Guests stop seeing the quest and nothing more is counted. Everyone&apos;s progress, unlocks and rewards are kept: rewards already held stay held and can
              still be handed over at the swag desk. Switching it on again counts what guests did meanwhile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Keep it on</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                void toggle(false);
              }}
            >
              Switch off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FigurePanel>
  );
}
