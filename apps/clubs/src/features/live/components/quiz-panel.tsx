"use client";

import * as React from "react";
import { ArrowLeftIcon, ArrowRightIcon, LockIcon, PlusIcon, Settings2Icon, TrophyIcon, Trash2Icon, ZapIcon } from "lucide-react";
import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Skeleton,
  cn,
} from "@moa/ui";

import { useFeatureGate } from "@/features/plan";

import { useNotifyChoice } from "../notify";
import { useQuiz, useRound, useRoundMutations, useRounds, useRoundsMutations } from "../queries";
import type { Quiz, QuizQuestion, RoundSummary } from "../schemas";
import { HostConsole, OverallPanel, useConfirmed, useStart } from "./quiz-host";
import { QuestionEditor, blankDraft, bodyOf, changed, draftOfQuestion, problemWith, type Draft } from "./quiz-question";
import { NotifySwitch } from "./notify-switch";
import { RoundSettings, rulesLine, settingsOf } from "./round-settings";

/**
 * The quiz: one round or several. The host writes each round's questions
 * here, sets its rules, then runs it from the same panel — a code goes on
 * the screen, the room joins on phones, and each question's tally fills in
 * as answers land. One round runs at a time; the board across the rounds
 * and each round's winners are a press away.
 *
 * Against a server from before rounds the panel is today's single quiz
 * (the round functions take null for it: api.ts).
 */

function SavedQuestion({
  eventId,
  quizId,
  n,
  question,
  roundPoints,
  onMove,
}: {
  eventId: number;
  quizId: string | null;
  n: number;
  question: QuizQuestion;
  roundPoints: number;
  onMove?: { up?: () => void; down?: () => void };
}) {
  const { edit, remove } = useRoundMutations(eventId, quizId);
  const [draft, setDraft] = React.useState<Draft>(() => draftOfQuestion(question));
  const [error, setError] = React.useState<string | null>(null);
  const commit = () => {
    const problem = problemWith(draft);
    if (problem) return setError(problem);
    setError(null);
    const body = bodyOf(draft, question);
    if (changed(body, question)) edit.mutate({ id: question.id, patch: body });
  };
  return (
    <QuestionEditor
      n={n}
      draft={draft}
      setDraft={setDraft}
      onCommit={commit}
      onRemove={() => remove.mutate(question.id)}
      onMove={onMove}
      error={error}
      roundPoints={roundPoints}
    />
  );
}

function NewQuestion({ eventId, quizId, n, onDone, roundPoints }: { eventId: number; quizId: string | null; n: number; onDone: () => void; roundPoints: number }) {
  const { add } = useRoundMutations(eventId, quizId);
  const [draft, setDraft] = React.useState<Draft>(() => blankDraft());
  const [error, setError] = React.useState<string | null>(null);
  const save = async () => {
    const problem = problemWith(draft);
    if (problem) return setError(problem);
    setError(null);
    try {
      await add.mutateAsync(bodyOf(draft));
    } catch {
      // Said by the mutation's own toast; the question stays open to try again.
      return;
    }
    onDone();
  };
  return (
    <div>
      <QuestionEditor n={n} draft={draft} setDraft={setDraft} onCommit={() => undefined} error={error} roundPoints={roundPoints} />
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

const STATUS_WORD: Record<RoundSummary["status"], string> = { draft: "", live: "live", ended: "done" };

/** The rounds, as chips: pick one to edit or run; add one; move the picked one along. */
function RoundsBar({
  eventId,
  rounds,
  selected,
  onPick,
}: {
  eventId: number;
  rounds: RoundSummary[];
  selected: string | null;
  onPick: (id: string) => void;
}) {
  const { create, order } = useRoundsMutations(eventId);
  const gate = useFeatureGate("quiz", { eventId });
  const [board, setBoard] = React.useState(false);
  const at = rounds.findIndex((r) => r.id === selected);
  const move = (by: -1 | 1) => {
    const ids = rounds.map((r) => r.id);
    const j = at + by;
    if (at < 0 || j < 0 || j >= ids.length) return;
    [ids[at], ids[j]] = [ids[j]!, ids[at]!];
    order.mutate(ids);
  };
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quiz rounds">
      {rounds.map((r, i) => (
        <Chip key={r.id} active={r.id === selected} onClick={() => onPick(r.id)}>
          <span className="font-mono text-[10.5px] opacity-70">{i + 1}</span>
          <span className="max-w-[180px] truncate">{r.title}</span>
          {STATUS_WORD[r.status] ? (
            <span className={cn("font-mono text-[10.5px]", r.id === selected ? "text-brand-foreground/80" : r.status === "live" ? "text-admit" : "text-ink-3")}>{STATUS_WORD[r.status]}</span>
          ) : null}
        </Chip>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={gate.guard(() => create.mutate({}, { onSuccess: (q) => onPick(q.id) }))}
        disabled={create.isPending || rounds.length >= 20}
      >
        {gate.locked ? <LockIcon className="size-3.5" /> : <PlusIcon className="size-3.5" />} Add a round
      </Button>
      {rounds.length > 1 ? (
        <>
          <Button size="icon-sm" variant="ghost" aria-label="Move this round earlier" disabled={at <= 0 || order.isPending} onClick={() => move(-1)}>
            <ArrowLeftIcon className="size-4" />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Move this round later" disabled={at < 0 || at >= rounds.length - 1 || order.isPending} onClick={() => move(1)}>
            <ArrowRightIcon className="size-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setBoard(true)}>
            <TrophyIcon className="size-3.5" /> Board across the rounds
          </Button>
          <Dialog open={board} onOpenChange={setBoard}>
            <DialogContent className="sm:max-w-[720px]">
              <DialogHeader>
                <DialogTitle>Across the rounds</DialogTitle>
                <DialogDescription>Every round that counts toward it, each player&apos;s scores added up; equal totals go to the faster.</DialogDescription>
              </DialogHeader>
              <OverallPanel eventId={eventId} />
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  );
}

function RoundEditor({
  eventId,
  quizId,
  quiz,
  checkedIn,
  canRemove,
  onRemoved,
}: {
  eventId: number;
  quizId: string | null;
  quiz: Quiz;
  checkedIn?: number | null;
  canRemove: boolean;
  onRemoved: () => void;
}) {
  const { host, rename, order, settings, drop } = useRoundMutations(eventId, quizId);
  const [adding, setAdding] = React.useState(false);
  const [title, setTitle] = React.useState<string | null>(null);
  const [rules, setRules] = React.useState(false);
  const [notify, setNotify] = useNotifyChoice(eventId, "quiz");
  const hosting = useStart(eventId, quizId, notify);
  // Not on the plan: what was written stays readable; writing and hosting open the upgrade dialog.
  const gate = useFeatureGate("quiz", { eventId });
  const removing = useConfirmed(
    { title: `Remove ${quiz.title}?`, body: "Its questions go with it. Rounds already played keep their scores in the board across the rounds only while they exist.", confirm: "Remove the round" },
    () => drop.mutate(undefined, { onSuccess: onRemoved }),
  );
  const st = settingsOf(quiz.settings);
  const running = quiz.status !== "draft";
  const seconds = quiz.questions.reduce((n, x) => n + x.seconds, 0);
  const ids = quiz.questions.map((q) => q.id);
  const move = (i: number, by: -1 | 1) => {
    const next = [...ids];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    order.mutate(next);
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <input
            className="text-ink page-title w-full max-w-[520px] bg-transparent text-[20px] outline-none"
            value={title ?? quiz.title}
            aria-label="Quiz title"
            maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => (title !== null && title.trim() && title !== quiz.title ? rename.mutate({ title: title.trim() }) : null, setTitle(null))}
          />
          <p className="text-ink-3 mt-1 text-[12.5px]">
            {quiz.questions.length} {quiz.questions.length === 1 ? "question" : "questions"} · {seconds} seconds · players join with a code on their phone, scores reward fast correct answers
          </p>
          {quiz.settings ? <p className="text-ink-3 mt-0.5 text-[12px]">{rulesLine(st)}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {!running ? <NotifySwitch checked={notify} onCheckedChange={setNotify} checkedIn={checkedIn} hint="A push to join, as the quiz opens" /> : null}
          <div className="flex flex-wrap gap-2">
            {quiz.settings ? (
              <Button variant="outline" onClick={() => setRules(true)}>
                <Settings2Icon className="size-4" /> Rules
              </Button>
            ) : null}
            {!running ? (
              <>
                <Button variant="outline" onClick={gate.guard(() => setAdding(true))} disabled={adding}>
                  {gate.locked ? <LockIcon className="size-4" /> : <PlusIcon className="size-4" />} Add question
                </Button>
                <Button onClick={gate.guard(hosting.start)} disabled={quiz.questions.length === 0 || host.isPending || hosting.pending}>
                  {gate.locked ? <LockIcon className="size-4" /> : <ZapIcon className="size-4" />} Host live
                </Button>
                {canRemove ? (
                  <Button size="icon" variant="ghost" aria-label={`Remove ${quiz.title}`} onClick={removing.ask}>
                    <Trash2Icon className="size-4" />
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
      {hosting.dialog}
      {removing.dialog}
      {quiz.settings ? (
        <RoundSettings
          open={rules}
          onOpenChange={setRules}
          settings={st}
          title={quiz.title}
          running={quiz.status === "live"}
          saving={settings.isPending}
          onSave={(change) => settings.mutate(change, { onSuccess: () => setRules(false) })}
        />
      ) : null}

      {running ? (
        <HostConsole eventId={eventId} quizId={quizId} checkedIn={checkedIn} />
      ) : (
        <div className="grid gap-3">
          {quiz.questions.map((question, i) => (
            <SavedQuestion
              // The question's shape, not just its id: a reorder or a server-side change re-reads the draft.
              key={`${question.id}:${question.sort_order}`}
              eventId={eventId}
              quizId={quizId}
              n={i + 1}
              question={question}
              roundPoints={st.scoring.points}
              onMove={quiz.questions.length > 1 ? { up: i > 0 ? () => move(i, -1) : undefined, down: i < ids.length - 1 ? () => move(i, 1) : undefined } : undefined}
            />
          ))}
          {adding ? <NewQuestion eventId={eventId} quizId={quizId} n={quiz.questions.length + 1} onDone={() => setAdding(false)} roundPoints={st.scoring.points} /> : null}
          {quiz.questions.length === 0 && !adding ? (
            <EmptyState
              tone="muted"
              title="No questions yet"
              description="Four to six quick ones work best — twenty seconds each. One right answer, several, true or false, a typed answer, an order or a poll."
              action={<Button onClick={gate.guard(() => setAdding(true))}>Write the first</Button>}
            />
          ) : null}
        </div>
      )}
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
  // The event's current round (made on first read, as today), and the list of rounds.
  const current = useQuiz(eventId);
  const rounds = useRounds(eventId);
  const [picked, setPicked] = React.useState<string | null>(null);
  // A server from before rounds: the one quiz, by today's paths.
  const legacy = rounds.isSuccess && rounds.data === null;
  const list = rounds.data ?? [];
  const live = list.find((r) => r.status === "live");
  const target = legacy ? null : picked && list.some((r) => r.id === picked) ? picked : (live?.id ?? current.data?.id ?? null);
  // Asked once the list has answered, so a server from before rounds is never asked for a round by id.
  const round = useRound(eventId, target, !rounds.isPending && (legacy || Boolean(target)));
  if (current.isError || round.isError) return <EmptyState tone="muted" title="The quiz could not load" description="Try again in a moment." />;
  if (!round.data) return <Skeleton className="h-72" />;
  return (
    <div className="grid gap-4">
      {!legacy && list.length > 1 ? <RoundsBar eventId={eventId} rounds={list} selected={target} onPick={setPicked} /> : null}
      <RoundEditor
        key={round.data.id}
        eventId={eventId}
        quizId={target}
        quiz={round.data}
        checkedIn={checkedIn}
        canRemove={!legacy && list.length > 1}
        onRemoved={() => setPicked(null)}
      />
      {!legacy && list.length <= 1 ? <AddRound eventId={eventId} onAdded={setPicked} /> : null}
    </div>
  );
}

/** With one round, a quiet way to a second: rounds stay out of the way until they are wanted. */
function AddRound({ eventId, onAdded }: { eventId: number; onAdded: (id: string) => void }) {
  const { create } = useRoundsMutations(eventId);
  const gate = useFeatureGate("quiz", { eventId });
  return (
    <p className="text-ink-3 text-[12.5px]">
      Several rounds tonight?{" "}
      <button
        type="button"
        className="text-brand font-medium underline-offset-2 hover:underline disabled:opacity-50"
        disabled={create.isPending}
        onClick={gate.guard(() => create.mutate({}, { onSuccess: (q) => onAdded(q.id) }))}
      >
        Add a round
      </button>{" "}
      — each has its own questions, code and board, and a board across them.
    </p>
  );
}
