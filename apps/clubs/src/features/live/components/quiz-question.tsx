"use client";

import * as React from "react";
import { ArrowDownIcon, ArrowUpIcon, CheckCircle2Icon, CheckSquareIcon, CircleIcon, SlidersHorizontalIcon, SquareIcon, Trash2Icon } from "lucide-react";
import { Button, Chip, FigurePanel, NativeSelect, Segmented, cn } from "@moa/ui";

import type { QuizQuestionBody } from "../api";
import { OPTION_KEYS, QUESTION_SECONDS, type QuestionKind, type QuizQuestion } from "../schemas";
import { SHAPES } from "../theme";

/**
 * One question in the round editor, of any kind: a single answer (today's),
 * several right answers with partial credit, true or false, a typed answer
 * with the variants that count, a put-in-order, or a poll with no score —
 * and, folded away, its own points and double points.
 *
 * A single-answer question nobody tuned sends exactly today's four fields,
 * so what the console writes is what an older server and every older phone
 * already understand.
 */

export const KIND_LABEL: Record<QuestionKind, string> = {
  single: "One right answer",
  multi: "Several right answers",
  true_false: "True or false",
  type: "Type the answer",
  order: "Put in order",
  poll: "Poll (no score)",
};

const KIND_HINT: Record<QuestionKind, string> = {
  single: "Mark the right answer.",
  multi: "Mark every right answer, and say how a partly right answer scores.",
  true_false: "Say whether the statement is true.",
  type: "Players type their answer. List every spelling that counts.",
  order: "Write the answers in the right order; phones show them shuffled.",
  poll: "No right answer: the room's picks show once it closes, and nobody scores.",
};

const MULTI_RULES = [
  { value: "all", label: "All or nothing" },
  { value: "proportional", label: "Partial credit" },
  { value: "subtract", label: "Wrong picks subtract" },
] as const;

export type Draft = {
  kind: QuestionKind;
  prompt: string;
  labels: string[];
  correct: string;
  correctKeys: string[];
  multiRule: "all" | "proportional" | "subtract";
  accepted: string;
  match: "exact" | "close";
  orderRule: "all" | "partial";
  seconds: number;
  /** The question's own points; null: the round's. */
  points: number | null;
  double: boolean;
};

export const blankDraft = (kind: QuestionKind = "single"): Draft => ({
  kind,
  prompt: "",
  labels: kind === "true_false" ? ["True", "False"] : ["", "", "", ""],
  correct: "a",
  correctKeys: [],
  multiRule: "all",
  accepted: "",
  match: "exact",
  orderRule: "all",
  seconds: 20,
  points: null,
  double: false,
});

export const draftOfQuestion = (q: QuizQuestion): Draft => {
  const kind = q.kind ?? "single";
  return {
    kind,
    prompt: q.prompt,
    labels: kind === "type" ? ["", "", "", ""] : q.options.map((o) => o.label),
    correct: q.correct_key ?? "a",
    correctKeys: q.correct_keys ?? [],
    multiRule: q.multi_rule ?? "all",
    accepted: (q.accepted ?? []).join("\n"),
    match: q.match ?? "exact",
    orderRule: q.order_rule ?? "all",
    seconds: q.seconds,
    points: q.points ?? null,
    double: Boolean(q.double),
  };
};

/** A kind change keeps what still fits: the wording, the time, the answers' text. */
export function withKind(d: Draft, kind: QuestionKind): Draft {
  if (kind === d.kind) return d;
  const labels = kind === "true_false" ? ["True", "False"] : d.kind === "true_false" ? ["", "", "", ""] : d.labels;
  return { ...d, kind, labels, correct: kind === "true_false" ? "a" : d.correct, correctKeys: kind === "multi" ? d.correctKeys.length ? d.correctKeys : [d.correct] : d.correctKeys };
}

const filled = (d: Draft) =>
  d.labels.map((label, i) => ({ key: OPTION_KEYS[i]!, label: label.trim() })).filter((o) => o.label);

const acceptedOf = (d: Draft) => [...new Set(d.accepted.split("\n").map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean))];

/** What is wrong with a draft, in the editor's words; null when it can be saved. */
export function problemWith(d: Draft): string | null {
  const prompt = d.prompt.trim();
  if (d.kind === "type") {
    if (prompt.length < 3) return "A question needs wording of at least three characters.";
    const acc = acceptedOf(d);
    if (acc.length === 0) return "List at least one answer that counts.";
    if (acc.length > 10) return "List at most ten accepted answers.";
    if (acc.some((a) => a.length > 120)) return "Keep each accepted answer under 120 characters.";
    return null;
  }
  const options = filled(d);
  if (!prompt || options.length < 2) return "A question needs wording and at least two answers.";
  if (prompt.length < 3) return "A question needs wording of at least three characters.";
  if ((d.kind === "single" || d.kind === "true_false") && !options.some((o) => o.key === d.correct)) return "Mark one of the filled answers as right.";
  if (d.kind === "multi" && !d.correctKeys.some((k) => options.some((o) => o.key === k))) return "Mark at least one of the filled answers as right.";
  return null;
}

/**
 * The body for a draft. A single-answer question with no overrides is
 * today's four fields; every other kind says its kind and its own fields.
 * `was` (the saved question) makes a change of kind, and a cleared
 * override, explicit.
 */
export function bodyOf(d: Draft, was?: QuizQuestion): QuizQuestionBody {
  const prompt = d.prompt.trim().replace(/\s+/g, " ");
  const options = filled(d);
  const body: QuizQuestionBody = { prompt, options, seconds: d.seconds };
  const prevKind = was ? (was.kind ?? "single") : "single";
  if (d.kind !== "single" || prevKind !== "single") body.kind = d.kind;
  if (d.kind === "single" || d.kind === "true_false") body.correct_key = d.correct;
  if (d.kind === "multi") {
    body.correct_keys = d.correctKeys.filter((k) => options.some((o) => o.key === k));
    body.multi_rule = d.multiRule;
  }
  if (d.kind === "type") {
    body.options = [];
    body.accepted = acceptedOf(d);
    body.match = d.match;
  }
  if (d.kind === "order") body.order_rule = d.orderRule;
  if (d.points !== null) body.points = d.points;
  else if (was?.points != null) body.points = null;
  if (d.double) body.double = true;
  else if (was?.double) body.double = false;
  return body;
}

/** Whether a body says something the saved question does not. */
export function changed(body: QuizQuestionBody, q: QuizQuestion): boolean {
  const kind = body.kind ?? "single";
  if (kind !== (q.kind ?? "single")) return true;
  if (body.prompt !== q.prompt || body.seconds !== q.seconds) return true;
  if (JSON.stringify(body.options) !== JSON.stringify(kind === "type" ? [] : q.options)) return true;
  if ((kind === "single" || kind === "true_false") && body.correct_key !== q.correct_key) return true;
  if (kind === "multi" && (JSON.stringify(body.correct_keys) !== JSON.stringify(q.correct_keys ?? []) || body.multi_rule !== (q.multi_rule ?? "all"))) return true;
  if (kind === "type" && (JSON.stringify(body.accepted) !== JSON.stringify(q.accepted ?? []) || body.match !== (q.match ?? "exact"))) return true;
  if (kind === "order" && body.order_rule !== (q.order_rule ?? "all")) return true;
  if ((body.points ?? null) !== (q.points ?? null) && body.points !== undefined) return true;
  if ((body.double ?? false) !== Boolean(q.double) && body.double !== undefined) return true;
  return false;
}

const field = "input h-9 w-full";

function OptionCell({
  label,
  index,
  mark,
  onMark,
  onLabel,
  readOnly,
  kind,
}: {
  label: string;
  index: number;
  /** null: answers here carry no right/wrong (order, poll). */
  mark: boolean | null;
  onMark?: () => void;
  onLabel: (v: string) => void;
  readOnly?: boolean;
  kind: QuestionKind;
}) {
  const many = kind === "multi";
  return (
    <div className={cn("bg-sunken flex items-center gap-2 rounded-lg border px-2.5 py-1.5", mark ? "border-admit/50" : "border-line-soft")}>
      <span className={cn("font-mono text-[11px]", mark ? "text-admit" : "text-ink-3")} aria-hidden="true">
        {kind === "order" ? index + 1 : SHAPES[index]}
      </span>
      <input
        className="text-ink min-w-0 flex-1 bg-transparent text-[13px] outline-none read-only:opacity-80"
        value={label}
        placeholder={kind === "order" ? `Step ${index + 1}` : `Answer ${index + 1}`}
        onChange={(e) => onLabel(e.target.value)}
        maxLength={120}
        readOnly={readOnly}
        aria-label={`Answer ${index + 1}`}
      />
      {mark !== null && onMark ? (
        <button
          type="button"
          onClick={onMark}
          aria-label={mark ? `Answer ${index + 1} is ${many ? "a" : "the"} right one` : `Mark answer ${index + 1} as right`}
          aria-pressed={mark}
          className={cn("shrink-0", mark ? "text-admit" : "text-ink-3 hover:text-ink")}
        >
          {many ? mark ? <CheckSquareIcon className="size-4" /> : <SquareIcon className="size-4" /> : mark ? <CheckCircle2Icon className="size-4" /> : <CircleIcon className="size-4" />}
        </button>
      ) : null}
    </div>
  );
}

export function QuestionEditor({
  n,
  draft,
  setDraft,
  onCommit,
  onRemove,
  onMove,
  error,
  roundPoints,
}: {
  n: number;
  draft: Draft;
  setDraft: (d: Draft) => void;
  onCommit: () => void;
  onRemove?: () => void;
  /** Up (-1) or down (+1) among the round's questions; absent at that end. */
  onMove?: { up?: () => void; down?: () => void };
  error?: string | null;
  /** The round's points per question, for the override's placeholder. */
  roundPoints: number;
}) {
  const [more, setMore] = React.useState(draft.points !== null || draft.double);
  const kind = draft.kind;
  const setLabel = (i: number, v: string) => setDraft({ ...draft, labels: draft.labels.map((l, j) => (j === i ? v : l)) });
  const moveOption = (i: number, by: -1 | 1) => {
    const labels = [...draft.labels];
    const j = i + by;
    if (j < 0 || j >= labels.length) return;
    [labels[i], labels[j]] = [labels[j]!, labels[i]!];
    setDraft({ ...draft, labels });
  };
  const leaving = (e: React.FocusEvent<HTMLElement>) => (e.currentTarget.contains(e.relatedTarget as Node) ? null : onCommit());
  const overridden = draft.points !== null || draft.double;
  return (
    <FigurePanel className="p-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="bg-brand-soft text-brand grid size-7 shrink-0 place-items-center rounded-md font-mono text-[11px] font-semibold">{n}</span>
        <input
          className={cn(field, "min-w-[200px] flex-1")}
          value={draft.prompt}
          placeholder={kind === "true_false" ? "The statement" : "The question"}
          maxLength={300}
          aria-label={`Question ${n}`}
          onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
          onBlur={onCommit}
        />
        <NativeSelect
          className="w-[196px] shrink-0"
          value={kind}
          aria-label={`Kind of question ${n}`}
          onChange={(e) => setDraft(withKind(draft, e.target.value as QuestionKind))}
          onBlur={onCommit}
        >
          {(Object.keys(KIND_LABEL) as QuestionKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="w-[84px] shrink-0"
          value={draft.seconds}
          aria-label={`Seconds for question ${n}`}
          onChange={(e) => setDraft({ ...draft, seconds: Number(e.target.value) })}
          onBlur={onCommit}
        >
          {[...new Set([...QUESTION_SECONDS, draft.seconds])].sort((a, b) => a - b).map((s) => (
            <option key={s} value={s}>
              {s} s
            </option>
          ))}
        </NativeSelect>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`Points for question ${n}`}
          aria-expanded={more}
          title="Points and double points"
          className={cn(overridden && "text-brand")}
          onClick={() => setMore((m) => !m)}
        >
          <SlidersHorizontalIcon className="size-4" />
        </Button>
        {onMove ? (
          <>
            <Button size="icon-xs" variant="ghost" aria-label={`Move question ${n} up`} disabled={!onMove.up} onClick={onMove.up}>
              <ArrowUpIcon className="size-4" />
            </Button>
            <Button size="icon-xs" variant="ghost" aria-label={`Move question ${n} down`} disabled={!onMove.down} onClick={onMove.down}>
              <ArrowDownIcon className="size-4" />
            </Button>
          </>
        ) : null}
        {onRemove ? (
          <Button size="icon-xs" variant="ghost" aria-label={`Remove question ${n}`} onClick={onRemove}>
            <Trash2Icon className="size-4" />
          </Button>
        ) : null}
      </div>

      <p className="text-ink-3 mt-2 text-[12px]">{KIND_HINT[kind]}</p>

      {kind === "type" ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]" onBlur={leaving}>
          <textarea
            className="input min-h-[72px] w-full py-2 text-[13px]"
            value={draft.accepted}
            onChange={(e) => setDraft({ ...draft, accepted: e.target.value })}
            placeholder={"São Paulo\nSao Paulo"}
            aria-label={`Accepted answers for question ${n}, one per line`}
          />
          <div className="grid content-start gap-1.5">
            <span className="eyebrow">Counts as right</span>
            <Segmented
              label={`How close an answer to question ${n} must be`}
              value={draft.match}
              options={[
                { value: "exact", label: "Exactly" },
                { value: "close", label: "Close enough" },
              ]}
              onChange={(match) => setDraft({ ...draft, match })}
            />
            <span className="text-ink-3 text-[11.5px]">
              {draft.match === "close" ? "A typo or two is forgiven on longer answers." : "Capitals, spaces and accents never matter."}
            </span>
          </div>
        </div>
      ) : (
        <div className={cn("mt-2 grid gap-2", kind === "order" ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-4")} onBlur={leaving}>
          {draft.labels.map((label, i) => (
            <div key={i} className={kind === "order" ? "flex items-center gap-1.5" : undefined}>
              <div className="min-w-0 flex-1">
                <OptionCell
                  label={label}
                  index={i}
                  kind={kind}
                  readOnly={kind === "true_false"}
                  mark={kind === "order" || kind === "poll" ? null : kind === "multi" ? draft.correctKeys.includes(OPTION_KEYS[i]!) : draft.correct === OPTION_KEYS[i]}
                  onMark={() => {
                    const key = OPTION_KEYS[i]!;
                    if (kind === "multi")
                      setDraft({ ...draft, correctKeys: draft.correctKeys.includes(key) ? draft.correctKeys.filter((k) => k !== key) : [...draft.correctKeys, key] });
                    else setDraft({ ...draft, correct: key });
                  }}
                  onLabel={(v) => setLabel(i, v)}
                />
              </div>
              {kind === "order" ? (
                <>
                  <Button size="icon-xs" variant="ghost" aria-label={`Move answer ${i + 1} up`} disabled={i === 0} onClick={() => moveOption(i, -1)}>
                    <ArrowUpIcon className="size-4" />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label={`Move answer ${i + 1} down`} disabled={i === draft.labels.length - 1} onClick={() => moveOption(i, 1)}>
                    <ArrowDownIcon className="size-4" />
                  </Button>
                </>
              ) : null}
            </div>
          ))}
          {kind !== "true_false" && draft.labels.length < 6 ? (
            <button type="button" className="text-ink-3 hover:text-ink justify-self-start text-[12px] underline-offset-2 hover:underline" onClick={() => setDraft({ ...draft, labels: [...draft.labels, ""] })}>
              + Another answer
            </button>
          ) : null}
        </div>
      )}

      {kind === "multi" ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2" onBlur={leaving}>
          <span className="eyebrow">A partly right answer</span>
          <Segmented label={`How question ${n} scores a partly right answer`} value={draft.multiRule} options={MULTI_RULES} onChange={(multiRule) => setDraft({ ...draft, multiRule })} />
        </div>
      ) : null}
      {kind === "order" ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2" onBlur={leaving}>
          <span className="eyebrow">Scoring</span>
          <Segmented
            label={`How question ${n} scores an order`}
            value={draft.orderRule}
            options={[
              { value: "all", label: "Only the exact order" },
              { value: "partial", label: "Credit for each in place" },
            ]}
            onChange={(orderRule) => setDraft({ ...draft, orderRule })}
          />
        </div>
      ) : null}

      {more && kind !== "poll" ? (
        <div className="border-line-soft mt-3 flex flex-wrap items-center gap-3 border-t pt-3" onBlur={leaving}>
          <label className="flex items-center gap-2 text-[12.5px]">
            <span className="text-ink-2">Points</span>
            <input
              type="number"
              min={0}
              max={10000}
              step={100}
              className="input h-8 w-[110px]"
              value={draft.points ?? ""}
              placeholder={`${roundPoints} (round)`}
              aria-label={`Points for question ${n}, empty for the round's`}
              onChange={(e) => setDraft({ ...draft, points: e.target.value === "" ? null : Math.max(0, Math.min(10000, Math.round(Number(e.target.value)))) })}
            />
          </label>
          <Chip active={draft.double} onClick={() => setDraft({ ...draft, double: !draft.double })}>
            Double points
          </Chip>
          <span className="text-ink-3 text-[11.5px]">
            Worth {(draft.points ?? roundPoints) * (draft.double ? 2 : 1)} points at most.
          </span>
        </div>
      ) : null}

      {error ? <p className="text-refuse mt-2 text-[12px]">{error}</p> : null}
    </FigurePanel>
  );
}
