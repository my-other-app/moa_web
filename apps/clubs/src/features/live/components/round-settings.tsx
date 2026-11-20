"use client";

import * as React from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import {
  Button,
  NativeSelect,
  Segmented,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Switch,
} from "@moa/ui";

import type { SettingsPatch } from "../api";
import { DEFAULT_QUIZ_SETTINGS, type QuizSettings, type Team } from "../schemas";

/**
 * A round's rules (CONTRACT 3.1): how it scores, how it moves, who may play
 * and as what, and teams. Every default is today's quiz, so a round nobody
 * opens this for plays exactly as quizzes always have. Saving sends only
 * what changed; the server merges it into what is saved.
 */

/** The settings with every field present (a server from before sends none). */
export const settingsOf = (s: QuizSettings | null | undefined): QuizSettings => s ?? DEFAULT_QUIZ_SETTINGS;

/** What changed, section by section and key by key: what PATCH takes. */
export function settingsDiff(before: QuizSettings, after: QuizSettings): SettingsPatch {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(after) as (keyof QuizSettings)[]) {
    const a = after[k];
    const b = before[k];
    if (a && typeof a === "object" && !Array.isArray(a)) {
      const part: Record<string, unknown> = {};
      for (const [kk, vv] of Object.entries(a)) {
        if (JSON.stringify(vv) !== JSON.stringify((b as Record<string, unknown>)[kk])) part[kk] = vv;
      }
      if (Object.keys(part).length) out[k] = part;
    } else if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = a;
  }
  return out as SettingsPatch;
}

/** The round's rules in a line, under its title. */
export function rulesLine(s: QuizSettings): string {
  const sc = s.scoring;
  const parts = [`${sc.points} points`];
  parts.push(sc.speed === "off" ? "no speed bonus" : sc.speed === "steps" ? "speed in steps" : "faster scores more");
  if (sc.wrong_penalty) parts.push(`−${Math.round(sc.wrong_penalty * 100)}% for a wrong answer`);
  if (sc.streak_from) parts.push(`+${sc.streak_bonus} from ${sc.streak_from} in a row`);
  parts.push(s.flow.advance === "auto" ? `moves on by itself after ${s.flow.auto_seconds} s` : "you move it on");
  if (s.flow.reveal === "host") parts.push("you reveal each answer");
  if (s.teams.mode !== "off") parts.push(`${s.teams.list.length} teams`);
  return parts.join(" · ");
}

const TEAM_COLOURS = ["#DC2626", "#2563EB", "#D97706", "#16A34A", "#7C3AED", "#0891B2", "#DB2777", "#4B5563"];
const TEAM_NAMES = ["Red", "Blue", "Amber", "Green", "Purple", "Teal", "Pink", "Grey"];

function nextTeam(list: Team[]): Team {
  const i = list.length;
  let n = i + 1;
  const keys = new Set(list.map((t) => t.key));
  while (keys.has(`team-${n}`)) n++;
  return { key: `team-${n}`, name: TEAM_NAMES[i] ?? `Team ${n}`, color: TEAM_COLOURS[i] ?? "#4B5563" };
}

function Row({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-ink text-[13px] font-medium">{label}</span>
      {children}
      {hint ? <span className="text-ink-3 text-[11.5px] leading-snug">{hint}</span> : null}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = React.useId();
  return (
    <label className="flex cursor-pointer items-start gap-2.5" htmlFor={id}>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" aria-label={label} />
      <span className="leading-tight">
        <span className="text-ink block text-[13px] font-medium">{label}</span>
        {hint ? <span className="text-ink-3 block text-[11.5px]">{hint}</span> : null}
      </span>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-line-soft grid gap-4 border-t px-4 py-4 first:border-t-0">
      <h3 className="eyebrow">{title}</h3>
      {children}
    </section>
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function RoundSettings({
  open,
  onOpenChange,
  settings,
  title,
  onSave,
  saving,
  running,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: QuizSettings;
  title: string;
  onSave: (change: SettingsPatch) => void;
  saving: boolean;
  /** A running round takes changes from the next answer or join on. */
  running: boolean;
}) {
  const [draft, setDraft] = React.useState(settings);
  const [was, setWas] = React.useState(settings);
  // Opened again with what is saved now, not what was left unsaved last time.
  if (open && was !== settings) {
    setWas(settings);
    setDraft(settings);
  }
  const set = <K extends keyof QuizSettings>(k: K, v: Partial<QuizSettings[K]> | QuizSettings[K]) =>
    setDraft((d) => ({ ...d, [k]: typeof v === "object" && !Array.isArray(v) ? { ...(d[k] as object), ...v } : v }));
  const sc = draft.scoring;
  const fl = draft.flow;
  const pl = draft.players;
  const tm = draft.teams;
  const diff = settingsDiff(settings, draft);
  const dirty = Object.keys(diff).length > 0;
  const teamsBad = tm.mode !== "off" && (tm.list.length < 2 || tm.list.some((t) => !t.name.trim()));
  const setStep = (i: number, part: Partial<{ until: number; share: number }>) =>
    set("scoring", { steps: sc.steps.map((s, j) => (j === i ? { ...s, ...part } : s)) });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-[460px]">
        <SheetHeader className="border-line-soft border-b">
          <SheetTitle>Rules for {title}</SheetTitle>
          <SheetDescription>
            {running ? "The round is running: a change counts from the next answer or join." : "Every default is the quiz as it has always played."}
          </SheetDescription>
        </SheetHeader>

        <Section title="Scoring">
          <Row label="Points for a right answer" hint="Each question can have its own, or double, in the editor.">
            <input
              type="number"
              min={0}
              max={10000}
              step={100}
              className="input h-9 w-[140px]"
              aria-label="Points for a right answer"
              value={sc.points}
              onChange={(e) => set("scoring", { points: Math.max(0, Math.min(10000, Math.round(Number(e.target.value) || 0))) })}
            />
          </Row>
          <Row
            label="Speed"
            hint={
              sc.speed === "off"
                ? "A right answer scores the full points, however long it took."
                : sc.speed === "linear"
                  ? `${pct(1 - sc.speed_share)} of the points for being right, up to ${pct(sc.speed_share)} more for being fast.`
                  : "Full points early on, then less in steps."
            }
          >
            <Segmented
              label="Speed bonus"
              value={sc.speed}
              options={[
                { value: "off", label: "No bonus" },
                { value: "linear", label: "Faster scores more" },
                { value: "steps", label: "In steps" },
              ]}
              onChange={(speed) => set("scoring", { speed })}
            />
          </Row>
          {sc.speed === "linear" ? (
            <Row label={`Share that depends on speed: ${pct(sc.speed_share)}`}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                aria-label="Share of the points that depends on speed"
                value={sc.speed_share}
                onChange={(e) => set("scoring", { speed_share: Math.round(Number(e.target.value) * 100) / 100 })}
              />
            </Row>
          ) : null}
          {sc.speed === "steps" ? (
            <Row label="Steps" hint="The last step runs to the end of the time.">
              <ol className="grid gap-1.5">
                {sc.steps.map((s, i) => {
                  const last = i === sc.steps.length - 1;
                  return (
                    <li key={i} className="flex items-center gap-2 text-[12.5px]">
                      <span className="text-ink-2 w-[78px] shrink-0">{last ? "To the end" : "Up to"}</span>
                      {last ? (
                        <span className="text-ink-3 w-[86px]">100% of time</span>
                      ) : (
                        <NativeSelect
                          size="sm"
                          className="w-[86px]"
                          aria-label={`Step ${i + 1} ends at`}
                          value={Math.round(s.until * 100)}
                          onChange={(e) => setStep(i, { until: Number(e.target.value) / 100 })}
                        >
                          {[10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90].map((v) => (
                            <option key={v} value={v}>
                              {v}%
                            </option>
                          ))}
                        </NativeSelect>
                      )}
                      <span className="text-ink-3">→</span>
                      <NativeSelect
                        size="sm"
                        className="w-[96px]"
                        aria-label={`Points in step ${i + 1}`}
                        value={Math.round(s.share * 100)}
                        onChange={(e) => setStep(i, { share: Number(e.target.value) / 100 })}
                      >
                        {[100, 90, 80, 75, 70, 60, 50, 40, 30, 25, 20, 10, 0].map((v) => (
                          <option key={v} value={v}>
                            {v}% points
                          </option>
                        ))}
                      </NativeSelect>
                      {sc.steps.length > 1 && !last ? (
                        <Button size="icon-xs" variant="ghost" aria-label={`Remove step ${i + 1}`} onClick={() => set("scoring", { steps: sc.steps.filter((_, j) => j !== i) })}>
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
              {sc.steps.length < 5 ? (
                <Button
                  size="xs"
                  variant="outline"
                  className="justify-self-start"
                  onClick={() => {
                    const before = sc.steps.slice(0, -1);
                    const prev = before.at(-1)?.until ?? 0;
                    const until = Math.min(0.9, Math.round((prev + (1 - prev) / 2) * 20) / 20);
                    set("scoring", { steps: [...before, { until, share: sc.steps.at(-1)!.share }, sc.steps.at(-1)!] });
                  }}
                >
                  <PlusIcon className="size-3.5" /> Add a step
                </Button>
              ) : null}
            </Row>
          ) : null}
          <Row label="A wrong answer" hint={sc.wrong_penalty ? "A partly right answer is never penalised; no answer scores 0." : undefined}>
            <Segmented
              label="Points for a wrong answer"
              value={String(sc.wrong_penalty) as "0" | "0.25" | "0.5"}
              options={[
                { value: "0", label: "Scores 0" },
                { value: "0.25", label: "Loses 25%" },
                { value: "0.5", label: "Loses 50%" },
              ]}
              onChange={(v) => set("scoring", { wrong_penalty: Number(v) })}
            />
          </Row>
          {sc.wrong_penalty ? (
            <Toggle
              label="Scores can go below zero"
              hint="Off: a player's total stops at 0."
              checked={sc.allow_negative}
              onChange={(allow_negative) => set("scoring", { allow_negative })}
            />
          ) : null}
          <Row label="Streak bonus" hint={sc.streak_from ? `+${sc.streak_bonus} on the ${sc.streak_from}th right answer in a row, and each one after.` : "Off."}>
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <NativeSelect
                size="sm"
                className="w-[150px]"
                aria-label="Streak from"
                value={sc.streak_from}
                onChange={(e) => set("scoring", { streak_from: Number(e.target.value) })}
              >
                <option value={0}>No streak bonus</option>
                {[2, 3, 4, 5, 6, 8, 10].map((n) => (
                  <option key={n} value={n}>
                    From {n} in a row
                  </option>
                ))}
              </NativeSelect>
              {sc.streak_from ? (
                <label className="flex items-center gap-1.5">
                  <span className="text-ink-2">+</span>
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    step={50}
                    className="input h-8 w-[90px]"
                    aria-label="Streak bonus points"
                    value={sc.streak_bonus}
                    onChange={(e) => set("scoring", { streak_bonus: Math.max(0, Math.min(5000, Math.round(Number(e.target.value) || 0))) })}
                  />
                  <span className="text-ink-2">points</span>
                </label>
              ) : null}
            </div>
          </Row>
          <Row label="Equal scores" hint={draft.ties === "time" ? "The faster player (less total answer time) ranks higher." : "Players with the same score share a place."}>
            <Segmented
              label="Equal scores"
              value={draft.ties}
              options={[
                { value: "join", label: "Share a place" },
                { value: "time", label: "Faster wins" },
              ]}
              onChange={(ties) => set("ties", ties)}
            />
          </Row>
        </Section>

        <Section title="Timing">
          <Row label="Moving on" hint={fl.advance === "auto" ? `The next question opens ${fl.auto_seconds} s after the answer shows.` : "You press Next for each question."}>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                label="Moving on"
                value={fl.advance}
                options={[
                  { value: "host", label: "When I press Next" },
                  { value: "auto", label: "By itself" },
                ]}
                onChange={(advance) => set("flow", { advance })}
              />
              {fl.advance === "auto" ? (
                <NativeSelect size="sm" className="w-[110px]" aria-label="Seconds before moving on" value={fl.auto_seconds} onChange={(e) => set("flow", { auto_seconds: Number(e.target.value) })}>
                  {[3, 5, 8, 10, 15, 20, 30, 45, 60].map((n) => (
                    <option key={n} value={n}>
                      after {n} s
                    </option>
                  ))}
                </NativeSelect>
              ) : null}
            </div>
          </Row>
          <Row label="The right answer shows" hint={fl.reveal === "host" ? "Answers close when time is up; the answer and points wait for your Reveal." : "As soon as time is up."}>
            <Segmented
              label="When the answer shows"
              value={fl.reveal}
              options={[
                { value: "time_up", label: "When time is up" },
                { value: "host", label: "When I reveal it" },
              ]}
              onChange={(reveal) => set("flow", { reveal })}
            />
          </Row>
          <Row label="The leaderboard shows">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                label="When the leaderboard shows"
                value={fl.board}
                options={[
                  { value: "every", label: "After every question" },
                  { value: "every_n", label: "Every few" },
                  { value: "end", label: "Only at the end" },
                ]}
                onChange={(board) => set("flow", { board })}
              />
              {fl.board === "every_n" ? (
                <NativeSelect size="sm" className="w-[130px]" aria-label="Leaderboard every" value={fl.board_every} onChange={(e) => set("flow", { board_every: Number(e.target.value) })}>
                  {[2, 3, 4, 5, 6, 8, 10].map((n) => (
                    <option key={n} value={n}>
                      every {n} questions
                    </option>
                  ))}
                </NativeSelect>
              ) : null}
            </div>
          </Row>
        </Section>

        <Section title="Players">
          <Row label="Names" hint={pl.names === "registered" ? "Only guests signed in with a registration for this event can play, as the name they registered with." : "Players pick a nickname when they join."}>
            <Segmented
              label="Player names"
              value={pl.names}
              options={[
                { value: "nickname", label: "Nicknames" },
                { value: "registered", label: "Registered names only" },
              ]}
              onChange={(names) => set("players", { names })}
            />
          </Row>
          <Toggle label="Refuse rude nicknames" hint="Names with words on the server's list are turned away." checked={pl.filter_names} onChange={(filter_names) => set("players", { filter_names })} />
          <Toggle label="Latecomers can join" hint="Off: nobody new joins once the first question opens; players already in can always come back." checked={pl.late_join} onChange={(late_join) => set("players", { late_join })} />
          <Toggle label="One player per ticket" hint="A registration plays on one device in this round." checked={pl.one_per_ticket} onChange={(one_per_ticket) => set("players", { one_per_ticket })} />
          <Toggle label="Hide names on the big screen" hint="The screen shows tags like Player 7F2; each phone says which tag is theirs." checked={pl.anonymous_screen} onChange={(anonymous_screen) => set("players", { anonymous_screen })} />
          <Toggle label="Counts toward the board across rounds" checked={draft.overall} onChange={(overall) => set("overall", overall)} />
        </Section>

        <Section title="Teams">
          <Row
            label="Play in teams"
            hint={tm.mode === "pick" ? "Players choose a team as they join (an older app is given one)." : tm.mode === "auto" ? "Each player is put in the team with the fewest." : undefined}
          >
            <Segmented
              label="Teams"
              value={tm.mode}
              options={[
                { value: "off", label: "No teams" },
                { value: "pick", label: "Players pick" },
                { value: "auto", label: "Assigned" },
              ]}
              onChange={(mode) => set("teams", { mode, list: mode !== "off" && tm.list.length < 2 ? [nextTeam([]), nextTeam([nextTeam([])])] : tm.list })}
            />
          </Row>
          {tm.mode !== "off" ? (
            <>
              <Row label="A team's score" hint={tm.score === "average" ? "Fair when teams are uneven: the members' total divided by how many there are." : "The members' scores added up."}>
                <Segmented
                  label="Team score"
                  value={tm.score}
                  options={[
                    { value: "total", label: "Total" },
                    { value: "average", label: "Average" },
                  ]}
                  onChange={(score) => set("teams", { score })}
                />
              </Row>
              <ol className="grid gap-2">
                {tm.list.map((team, i) => (
                  <li key={team.key} className="flex items-center gap-2">
                    <input
                      type="color"
                      className="border-line h-9 w-11 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
                      aria-label={`Colour of team ${i + 1}`}
                      value={team.color}
                      onChange={(e) => set("teams", { list: tm.list.map((x, j) => (j === i ? { ...x, color: e.target.value.toUpperCase() } : x)) })}
                    />
                    <input
                      className="input h-9 min-w-0 flex-1"
                      aria-label={`Name of team ${i + 1}`}
                      maxLength={40}
                      value={team.name}
                      onChange={(e) => set("teams", { list: tm.list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                    />
                    <Button size="icon-xs" variant="ghost" aria-label={`Remove team ${i + 1}`} disabled={tm.list.length <= 2} onClick={() => set("teams", { list: tm.list.filter((_, j) => j !== i) })}>
                      <Trash2Icon className="size-4" />
                    </Button>
                  </li>
                ))}
              </ol>
              {tm.list.length < 8 ? (
                <Button size="xs" variant="outline" className="justify-self-start" onClick={() => set("teams", { list: [...tm.list, nextTeam(tm.list)] })}>
                  <PlusIcon className="size-3.5" /> Add a team
                </Button>
              ) : null}
              {teamsBad ? <p className="text-refuse text-[12px]">Name at least two teams.</p> : null}
            </>
          ) : null}
        </Section>

        <SheetFooter className="border-line-soft bg-surface sticky bottom-0 flex-row justify-end gap-2 border-t">
          <Button variant="outline" onClick={() => setDraft(DEFAULT_QUIZ_SETTINGS)} disabled={JSON.stringify(draft) === JSON.stringify(DEFAULT_QUIZ_SETTINGS)}>
            Today&apos;s rules
          </Button>
          <Button
            onClick={() => {
              onSave({ ...diff, ...(diff.teams ? { teams: { ...diff.teams, list: tm.list.map((t) => ({ ...t, name: t.name.trim() })) } } : {}) });
            }}
            disabled={!dirty || saving || teamsBad}
          >
            {saving ? "Saving…" : "Save rules"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
