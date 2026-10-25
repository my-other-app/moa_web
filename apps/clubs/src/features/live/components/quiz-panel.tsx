"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckCircle2Icon,
  CircleIcon,
  ExternalLinkIcon,
  LockIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
  ZapIcon,
} from "lucide-react";
import {
  Button,
  CardLabel,
  EmptyState,
  FigurePanel,
  ProgressBar,
  Skeleton,
  cn,
} from "@moa/ui";

import { useFeatureGate } from "@/features/plan";

import { useNotifyChoice } from "../notify";
import { useHostState, useQuiz, useQuizMutations } from "../queries";
import { OPTION_KEYS, SECONDS, type QuizQuestion } from "../schemas";
import { NotifySwitch } from "./notify-switch";

/**
 * The quiz: the host writes questions here, then drives the run from the
 * same panel — a code goes on the screen, the room joins on phones, and each
 * question's tally fills in as answers land.
 */
const MARK = ["▲", "◆", "●", "■", "★", "✚"];
const field = "input h-9 w-full";

function OptionCell({
  label,
  index,
  correct,
  onPick,
  onLabel,
}: {
  label: string;
  index: number;
  correct: boolean;
  onPick: () => void;
  onLabel: (v: string) => void;
}) {
  return (
    <div
      className={cn(
        "bg-sunken flex items-center gap-2 rounded-lg border px-2.5 py-1.5",
        correct ? "border-admit/50" : "border-line-soft",
      )}
    >
      <span
        className={cn(
          "font-mono text-[11px]",
          correct ? "text-admit" : "text-ink-3",
        )}
        aria-hidden="true"
      >
        {MARK[index]}
      </span>
      <input
        className="text-ink min-w-0 flex-1 bg-transparent text-[13px] outline-none"
        value={label}
        placeholder={`Answer ${index + 1}`}
        onChange={(e) => onLabel(e.target.value)}
        maxLength={120}
        aria-label={`Answer ${index + 1}`}
      />
      <button
        type="button"
        onClick={onPick}
        aria-label={
          correct
            ? `Answer ${index + 1} is the right one`
            : `Mark answer ${index + 1} as right`
        }
        aria-pressed={correct}
        className={cn(
          "shrink-0",
          correct ? "text-admit" : "text-ink-3 hover:text-ink",
        )}
      >
        {correct ? (
          <CheckCircle2Icon className="size-4" />
        ) : (
          <CircleIcon className="size-4" />
        )}
      </button>
    </div>
  );
}

type Draft = {
  prompt: string;
  labels: string[];
  correct: string;
  seconds: number;
};
const blank = (): Draft => ({
  prompt: "",
  labels: ["", "", "", ""],
  correct: "a",
  seconds: 20,
});
const toBody = (d: Draft) => ({
  prompt: d.prompt.trim(),
  options: d.labels
    .map((label, i) => ({ key: OPTION_KEYS[i]!, label: label.trim() }))
    .filter((o) => o.label),
  correct_key: d.correct,
  seconds: d.seconds,
});
const fromQuestion = (q: QuizQuestion): Draft => ({
  prompt: q.prompt,
  labels: q.options.map((o) => o.label),
  correct: q.correct_key ?? "a",
  seconds: q.seconds,
});

function QuestionEditor({
  n,
  draft,
  setDraft,
  onCommit,
  onRemove,
  error,
}: {
  n: number;
  draft: Draft;
  setDraft: (d: Draft) => void;
  onCommit: () => void;
  onRemove?: () => void;
  error?: string | null;
}) {
  return (
    <FigurePanel className="p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="bg-brand-soft text-brand grid size-7 shrink-0 place-items-center rounded-md font-mono text-[11px] font-semibold">
          {n}
        </span>
        <input
          className={field}
          value={draft.prompt}
          placeholder="The question"
          maxLength={300}
          aria-label={`Question ${n}`}
          onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
          onBlur={onCommit}
        />
        <select
          className="input w-[84px] shrink-0"
          value={draft.seconds}
          aria-label={`Seconds for question ${n}`}
          onChange={(e) =>
            setDraft({ ...draft, seconds: Number(e.target.value) })
          }
          onBlur={onCommit}
        >
          {SECONDS.map((s) => (
            <option key={s} value={s}>
              {s} s
            </option>
          ))}
        </select>
        {onRemove ? (
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Remove question ${n}`}
            onClick={onRemove}
          >
            <Trash2Icon className="size-4" />
          </Button>
        ) : null}
      </div>
      <div
        className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        onBlur={(e) =>
          e.currentTarget.contains(e.relatedTarget as Node) ? null : onCommit()
        }
      >
        {draft.labels.map((label, i) => (
          <OptionCell
            key={i}
            label={label}
            index={i}
            correct={draft.correct === OPTION_KEYS[i]}
            onPick={() => setDraft({ ...draft, correct: OPTION_KEYS[i]! })}
            onLabel={(v) =>
              setDraft({
                ...draft,
                labels: draft.labels.map((l, j) => (j === i ? v : l)),
              })
            }
          />
        ))}
      </div>
      {error ? <p className="text-refuse mt-2 text-[12px]">{error}</p> : null}
    </FigurePanel>
  );
}

function SavedQuestion({
  eventId,
  n,
  question,
}: {
  eventId: number;
  n: number;
  question: QuizQuestion;
}) {
  const { edit, remove } = useQuizMutations(eventId);
  const [draft, setDraft] = React.useState<Draft>(() => fromQuestion(question));
  const [error, setError] = React.useState<string | null>(null);
  const commit = () => {
    const body = toBody(draft);
    if (!body.prompt || body.options.length < 2)
      return setError("A question needs wording and at least two answers.");
    if (!body.options.some((o) => o.key === body.correct_key))
      return setError("Mark one of the filled answers as right.");
    setError(null);
    const same =
      body.prompt === question.prompt &&
      body.seconds === question.seconds &&
      body.correct_key === question.correct_key &&
      JSON.stringify(body.options) === JSON.stringify(question.options);
    if (!same) edit.mutate({ id: question.id, patch: body });
  };
  return (
    <QuestionEditor
      n={n}
      draft={draft}
      setDraft={setDraft}
      onCommit={commit}
      onRemove={() => remove.mutate(question.id)}
      error={error}
    />
  );
}

function NewQuestion({
  eventId,
  n,
  onDone,
}: {
  eventId: number;
  n: number;
  onDone: () => void;
}) {
  const { add } = useQuizMutations(eventId);
  const [draft, setDraft] = React.useState<Draft>(blank);
  const [error, setError] = React.useState<string | null>(null);
  const save = async () => {
    const body = toBody(draft);
    if (!body.prompt || body.options.length < 2)
      return setError("A question needs wording and at least two answers.");
    if (!body.options.some((o) => o.key === body.correct_key))
      return setError("Mark one of the filled answers as right.");
    setError(null);
    try {
      await add.mutateAsync(body);
    } catch {
      // Said by the mutation's own toast; the question stays open to try again.
      return;
    }
    onDone();
  };
  return (
    <div>
      <QuestionEditor
        n={n}
        draft={draft}
        setDraft={setDraft}
        onCommit={() => undefined}
        error={error}
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={save} disabled={add.isPending}>
          {add.isPending ? "Saving…" : "Save question"}
        </Button>
      </div>
    </div>
  );
}

function HostConsole({ eventId, checkedIn }: { eventId: number; checkedIn?: number | null }) {
  const { host } = useQuizMutations(eventId);
  const gate = useFeatureGate("quiz", { eventId });
  const state = useHostState(eventId, true);
  const [notify, setNotify] = useNotifyChoice(eventId, "quiz");
  const s = state.data;
  if (!s) return <Skeleton className="h-64" />;
  const q = s.question;
  const last = s.current_index + 1 >= s.total;
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <FigurePanel className="p-5">
        {s.status === "ended" ? (
          <>
            <CardLabel>Finished</CardLabel>
            <p className="text-ink mt-2 text-[15px] font-semibold">
              That is the quiz. The board on the right stands.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
              <div className="flex gap-2">
                <Button
                  onClick={gate.guard(() => host.mutate({ action: "start", notify }))}
                  disabled={host.isPending}
                >
                  Run it again
                </Button>
                <Button variant="outline" onClick={() => host.mutate({ action: "reset" })}>
                  Back to editing
                </Button>
              </div>
              <NotifySwitch
                checked={notify}
                onCheckedChange={setNotify}
                checkedIn={checkedIn}
                hint="A push to join, as the quiz opens"
              />
            </div>
          </>
        ) : q ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <CardLabel>
                Question {s.current_index + 1} of {s.total}
              </CardLabel>
              <span
                className={cn(
                  "font-mono text-[12px] tabular-nums",
                  q.time_left === 0 ? "text-ink-3" : "text-caution",
                )}
                aria-live="polite"
              >
                {q.time_left === 0 ? "Time" : `${q.time_left}s`}
              </span>
            </div>
            <p className="text-ink mt-2 text-[18px] font-semibold tracking-[-0.01em]">
              {q.prompt}
            </p>
            <div className="mt-4 grid gap-2.5">
              {q.counts.map((c, i) => (
                <div key={c.key}>
                  <div className="flex items-center justify-between text-[12.5px]">
                    <span
                      className={cn(
                        c.correct ? "text-admit font-medium" : "text-ink-2",
                      )}
                    >
                      <span
                        className="mr-1.5 font-mono text-[11px]"
                        aria-hidden="true"
                      >
                        {MARK[i]}
                      </span>
                      {c.label}
                    </span>
                    <span className="text-ink-3 font-mono text-[11px] tabular-nums">
                      {c.count}
                    </span>
                  </div>
                  <ProgressBar
                    value={c.count}
                    max={Math.max(1, q.answered)}
                    tone={c.correct ? "admit" : "muted"}
                    className="mt-1"
                  />
                </div>
              ))}
            </div>
            <p className="text-ink-3 mt-3 text-[12px]">
              {q.answered} of {s.players} answered
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                onClick={() => host.mutate({ action: "next" })}
                disabled={host.isPending}
              >
                {last ? "Finish and show the board" : "Next question"}
              </Button>
              <Button variant="ghost" onClick={() => host.mutate({ action: "end" })}>
                End early
              </Button>
            </div>
          </>
        ) : (
          <>
            <CardLabel>Lobby</CardLabel>
            <p className="text-ink-2 mt-2 text-[13px]">
              Players open the event page, choose Join the quiz, and type this
              code:
            </p>
            <p
              className="text-brand mt-3 font-mono text-[44px] font-semibold tracking-[0.18em]"
              aria-label={`Join code ${s.join_code ?? ""}`}
            >
              {s.join_code}
            </p>
            <p className="text-ink-3 text-[12.5px]" aria-live="polite">
              {s.players} {s.players === 1 ? "player" : "players"} in
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                onClick={() => host.mutate({ action: "next" })}
                disabled={host.isPending}
              >
                <PlayIcon className="size-4" /> Ask the first question
              </Button>
              <Button variant="ghost" onClick={() => host.mutate({ action: "end" })}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </FigurePanel>
      <FigurePanel className="p-5">
        <CardLabel
          right={
            <span className="text-ink-3 font-mono text-[11px]">
              {s.players} playing
            </span>
          }
        >
          Leaderboard
        </CardLabel>
        {s.leaderboard.length === 0 ? (
          <p className="text-ink-3 mt-3 text-[12.5px]">
            Scores appear after the first question.
          </p>
        ) : (
          <ol className="mt-3 grid gap-1.5">
            {s.leaderboard.map((p) => (
              <li key={p.rank} className="flex items-center gap-3 text-[13px]">
                <span className="text-ink-3 w-5 font-mono text-[11px] tabular-nums">
                  {p.rank}
                </span>
                <span className="text-ink flex-1 truncate">{p.name}</span>
                <span className="text-ink-2 font-mono text-[12px] tabular-nums">
                  {p.score}
                </span>
              </li>
            ))}
          </ol>
        )}
        <Link
          href={`/screen/${eventId}`}
          target="_blank"
          className="btn btn-secondary btn-sm mt-4"
        >
          <ExternalLinkIcon className="size-3.5" /> Open the big screen
        </Link>
      </FigurePanel>
    </div>
  );
}

export function QuizPanel({
  eventId,
  checkedIn,
}: {
  eventId: number;
  /** The room's checked-in count, when the console already has it. */
  checkedIn?: number | null;
}) {
  const quiz = useQuiz(eventId);
  const { host, rename } = useQuizMutations(eventId);
  const [adding, setAdding] = React.useState(false);
  const [title, setTitle] = React.useState<string | null>(null);
  const [notify, setNotify] = useNotifyChoice(eventId, "quiz");
  // Not on the plan: what was written stays readable; writing and hosting open the upgrade dialog.
  const gate = useFeatureGate("quiz", { eventId });
  if (quiz.isPending) return <Skeleton className="h-72" />;
  if (quiz.isError || !quiz.data)
    return (
      <EmptyState
        tone="muted"
        title="The quiz could not load"
        description="Try again in a moment."
      />
    );
  const q = quiz.data;
  const running = q.status !== "draft";
  const seconds = q.questions.reduce((n, x) => n + x.seconds, 0);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <input
            className="text-ink page-title w-full max-w-[520px] bg-transparent text-[20px] outline-none"
            value={title ?? q.title}
            aria-label="Quiz title"
            maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => (
              title !== null && title.trim() && title !== q.title
                ? rename.mutate({ title: title.trim() })
                : null,
              setTitle(null)
            )}
          />
          <p className="text-ink-3 mt-1 text-[12.5px]">
            {q.questions.length}{" "}
            {q.questions.length === 1 ? "question" : "questions"} · {seconds}{" "}
            seconds · players join with a code on their phone, scores reward
            fast correct answers
          </p>
        </div>
        {!running ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <NotifySwitch
              checked={notify}
              onCheckedChange={setNotify}
              checkedIn={checkedIn}
              hint="A push to join, as the quiz opens"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={gate.guard(() => setAdding(true))}
                disabled={adding}
              >
                {gate.locked ? <LockIcon className="size-4" /> : <PlusIcon className="size-4" />} Add question
              </Button>
              <Button
                onClick={gate.guard(() => host.mutate({ action: "start", notify }))}
                disabled={q.questions.length === 0 || host.isPending}
              >
                {gate.locked ? <LockIcon className="size-4" /> : <ZapIcon className="size-4" />} Host live
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {running ? (
        <HostConsole eventId={eventId} checkedIn={checkedIn} />
      ) : (
        <div className="grid gap-3">
          {q.questions.map((question, i) => (
            <SavedQuestion
              key={question.id}
              eventId={eventId}
              n={i + 1}
              question={question}
            />
          ))}
          {adding ? (
            <NewQuestion
              eventId={eventId}
              n={q.questions.length + 1}
              onDone={() => setAdding(false)}
            />
          ) : null}
          {q.questions.length === 0 && !adding ? (
            <EmptyState
              tone="muted"
              title="No questions yet"
              description="Four to six quick ones work best — twenty seconds each, one right answer."
              action={
                <Button onClick={gate.guard(() => setAdding(true))}>Write the first</Button>
              }
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
