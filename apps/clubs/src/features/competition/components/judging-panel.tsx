"use client";

import * as React from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { FigurePanel, IconButton, NativeSelect, Notice, cn } from "@moa/ui";

import { useAddJudge, useDeleteJudge, usePatchSettings, usePutScore } from "../queries";
import { totalOf, type Competition, type Criterion } from "../schemas";

/**
 * Judging: the rubric on the left — criteria and their weights, which
 * should add to a hundred — and the judges, each with how many teams
 * they have scored; on the right, score as one judge, a slider per
 * criterion per team, the total out of a hundred as it moves. Scores
 * save when a slider is let go.
 */
function Rubric({ eventId, c }: { eventId: number; c: Competition }) {
  const settings = usePatchSettings(eventId);
  // Keyed on the saved rubric by the parent, so a fresh read starts the draft over.
  const [rows, setRows] = React.useState<Criterion[]>(c.settings.rubric);
  const total = rows.reduce((n, r) => n + r.weight, 0);
  const save = () => {
    if (JSON.stringify(rows) !== JSON.stringify(c.settings.rubric)) settings.mutate({ rubric: rows.filter((r) => r.label.trim()) });
  };
  const add = () => setRows([...rows, { key: `c${Date.now().toString(36)}`, label: "", weight: 0 }]);
  return (
    <FigurePanel className="p-4">
      <h3 className="text-ink text-[15px] font-semibold">
        Rubric · <span className={cn("font-mono", total === 100 ? "text-admit" : "text-caution")}>{total}%</span>
      </h3>
      <ul className="mt-3 grid gap-2">
        {rows.map((r, i) => (
          <li key={r.key} className="flex items-center gap-2">
            <input aria-label={`Criterion ${i + 1}`} className="input input-sm flex-1" value={r.label} placeholder="Criterion" onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} onBlur={save} maxLength={80} />
            <input aria-label={`${r.label || `Criterion ${i + 1}`} weight`} type="number" min={0} max={100} className="input input-sm w-20 text-right" value={r.weight} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, weight: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } : x)))} onBlur={save} />
            <span className="text-ink-3 text-[12px]">%</span>
            <IconButton label={`Remove ${r.label || "criterion"}`} variant="quiet" size="xs" danger onClick={() => { const next = rows.filter((_, k) => k !== i); setRows(next); settings.mutate({ rubric: next }); }}>
              <Trash2Icon />
            </IconButton>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={add}>
        <PlusIcon /> Add criterion
      </button>
      {total !== 100 ? <p className="text-caution mt-2 text-[11.5px]">Weights add to {total}%; scores still work, scaled to a hundred.</p> : null}
    </FigurePanel>
  );
}

function Judges({ eventId, c }: { eventId: number; c: Competition }) {
  const add = useAddJudge(eventId);
  const remove = useDeleteJudge(eventId);
  const [name, setName] = React.useState("");
  const submit = () => {
    if (!name.trim()) return;
    add.mutate({ name: name.trim() });
    setName("");
  };
  return (
    <FigurePanel className="p-4">
      <h3 className="text-ink text-[15px] font-semibold">Judges</h3>
      <ul className="mt-3 grid gap-2">
        {c.judges.map((j) => (
          <li key={j.id} className="flex items-center gap-2 text-[13px]">
            <span className="bg-sunken text-ink-2 grid size-7 place-items-center rounded-full font-mono text-[10px]">{j.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
            <span className="text-ink min-w-0 flex-1 truncate">{j.name}</span>
            <span className="text-ink-3 font-mono text-[11px]">
              {j.scored}/{c.teams.length} scored
            </span>
            <IconButton label={`Remove ${j.name}`} variant="quiet" size="xs" danger onClick={() => remove.mutate(j.id)}>
              <Trash2Icon />
            </IconButton>
          </li>
        ))}
        {c.judges.length === 0 ? <li className="text-ink-3 text-[12.5px]">No judges yet.</li> : null}
      </ul>
      <div className="mt-3 flex gap-2">
        <input className="input input-sm" placeholder="Add judge by name" aria-label="New judge" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => (e.key === "Enter" ? (e.preventDefault(), submit()) : null)} maxLength={100} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={submit} disabled={!name.trim() || add.isPending}>
          Add
        </button>
      </div>
    </FigurePanel>
  );
}

function ScoreCard({ eventId, c, judgeId, teamId, name }: { eventId: number; c: Competition; judgeId: number; teamId: number; name: string }) {
  const put = usePutScore(eventId);
  const saved = c.scores.find((s) => s.judge_id === judgeId && s.team_id === teamId);
  // Keyed on the saved scores by the parent, so what the server holds is what the sliders show.
  const [local, setLocal] = React.useState<Record<string, number>>(saved?.scores ?? {});
  const rubric = c.settings.rubric;
  const total = totalOf(rubric, local);
  const commit = () => put.mutate({ judgeId, teamId, scores: local });
  return (
    <div className="border-line-soft rounded-xl border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-ink text-[14px] font-semibold">{name}</span>
        <span className={cn("font-mono text-[13px] tabular-nums", total === null ? "text-ink-3" : "text-admit")}>{total === null ? "Not scored" : `${total.toFixed(1)} / 100`}</span>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {rubric.map((r) => (
          <label key={r.key} className="block">
            <span className="flex items-center justify-between text-[11.5px]">
              <span className="text-ink-2 truncate">{r.label}</span>
              <span className="text-ink font-mono tabular-nums">{local[r.key] ?? 0}/10</span>
            </span>
            <input type="range" min={0} max={10} step={1} aria-label={`${name} · ${r.label}`} className="accent-brand mt-1 w-full" value={local[r.key] ?? 0} onChange={(e) => setLocal({ ...local, [r.key]: Number(e.target.value) })} onMouseUp={commit} onTouchEnd={commit} onKeyUp={commit} />
          </label>
        ))}
      </div>
    </div>
  );
}

export function JudgingPanel({ eventId, c }: { eventId: number; c: Competition }) {
  const [judgeId, setJudgeId] = React.useState<number | null>(null);
  const judge = c.judges.find((j) => j.id === judgeId) ?? c.judges[0] ?? null;
  return (
    <div className="grid gap-4">
      {c.settings.rubric.length === 0 ? (
        <Notice tone="caution" tag="Rubric">
          Add at least one criterion before scoring.
        </Notice>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="grid content-start gap-3">
          <Rubric key={JSON.stringify(c.settings.rubric)} eventId={eventId} c={c} />
          <Judges eventId={eventId} c={c} />
        </div>
        <FigurePanel className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-ink text-[15px] font-semibold">Score as</h3>
            <NativeSelect aria-label="Score as" size="sm" className="w-auto min-w-48" value={judge?.id ?? ""} onChange={(e) => setJudgeId(Number(e.target.value))} disabled={c.judges.length === 0}>
              {c.judges.length === 0 ? <option value="">Add a judge first</option> : null}
              {c.judges.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          {judge && c.settings.rubric.length ? (
            c.teams.length === 0 ? (
              <p className="text-ink-3 mt-4 text-[12.5px]">No teams to score yet.</p>
            ) : (
              <div className="mt-3 grid gap-2">
                {c.teams.map((t) => {
                  const saved = c.scores.find((s) => s.judge_id === judge.id && s.team_id === t.id);
                  return <ScoreCard key={`${judge.id}-${t.id}-${JSON.stringify(saved?.scores ?? {})}`} eventId={eventId} c={c} judgeId={judge.id} teamId={t.id} name={t.name} />;
                })}
              </div>
            )
          ) : (
            <p className="text-ink-3 mt-4 text-[12.5px]">Scores need a judge and a rubric.</p>
          )}
        </FigurePanel>
      </div>
    </div>
  );
}
