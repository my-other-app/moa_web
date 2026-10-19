"use client";

import * as React from "react";
import { LockIcon, PlayIcon, PlusIcon, SquareIcon, Trash2Icon } from "lucide-react";
import {
  Button,
  CardLabel,
  Chip,
  EmptyState,
  FigurePanel,
  ProgressBar,
  Skeleton,
  StatusBadge,
  cn,
  type StatusTone,
} from "@moa/ui";

import { useFeatureGate } from "@/features/plan";

import { useNotifyChoice } from "../notify";
import { usePollMutations, usePolls } from "../queries";
import { POLL_KINDS, type Poll } from "../schemas";
import { NotifySwitch } from "./notify-switch";

/**
 * Polls and word clouds. One is live at a time: launching one closes the one
 * that was up, and its results draw on every phone and on the screen.
 */
export function WordCloud({
  words,
  className,
}: {
  words: { word: string; count: number }[];
  className?: string;
}) {
  if (words.length === 0)
    return (
      <p className={cn("text-ink-3 text-[12.5px]", className)}>
        Words appear as they come in.
      </p>
    );
  const max = Math.max(...words.map((w) => w.count));
  const min = Math.min(...words.map((w) => w.count));
  const size = (c: number) =>
    14 + (max === min ? 10 : (22 * (c - min)) / (max - min));
  return (
    <p
      className={cn(
        "bg-sunken flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 rounded-xl px-4 py-5 text-center leading-[1.25]",
        className,
      )}
    >
      {words.map((w, i) => (
        <span
          key={w.word}
          className={cn(
            "font-semibold tracking-[-0.01em]",
            i === 0 ? "text-brand" : i < 4 ? "text-ink" : "text-ink-2",
          )}
          style={{ fontSize: `${size(w.count)}px` }}
          title={`${w.count}`}
        >
          {w.word}
        </span>
      ))}
    </p>
  );
}

export function PollResults({
  poll,
  compact,
}: {
  poll: Poll;
  compact?: boolean;
}) {
  const r = poll.results;
  if (poll.kind === "words")
    return <WordCloud words={r.words ?? []} className="mt-3" />;
  if (poll.kind === "rating") {
    return (
      <div className="mt-3 grid gap-1.5">
        {(r.rating?.histogram ?? []).map((h) => (
          <div
            key={h.value}
            className="grid grid-cols-[16px_1fr_40px] items-center gap-2 text-[12.5px]"
          >
            <span className="text-ink-2 font-mono">{h.value}</span>
            <ProgressBar
              value={h.count}
              max={Math.max(1, r.responses)}
              tone="accent"
            />
            <span className="text-ink-3 text-right font-mono text-[11px] tabular-nums">
              {h.pct}%
            </span>
          </div>
        ))}
        {!compact ? (
          <p className="text-ink-3 mt-1 text-[12px]">
            Average {r.rating?.average ?? "–"} of 5
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="mt-3 grid gap-2">
      {(r.choices ?? []).map((c) => (
        <div key={c.label}>
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="text-ink">{c.label}</span>
            <span className="text-ink-3 font-mono text-[11px] tabular-nums">
              {c.pct}%
            </span>
          </div>
          <ProgressBar
            value={c.count}
            max={Math.max(1, r.responses)}
            tone="accent"
            className="mt-1"
          />
        </div>
      ))}
    </div>
  );
}

const TONE: Record<Poll["status"], StatusTone> = {
  live: "success",
  closed: "default",
  draft: "info",
};
const STATUS: Record<Poll["status"], string> = {
  live: "Live",
  closed: "Closed",
  draft: "Draft",
};

function PollCard({ eventId, poll, notify }: { eventId: number; poll: Poll; notify: boolean }) {
  const { status, remove } = usePollMutations(eventId);
  const gate = useFeatureGate("polls", { eventId });
  const kind =
    POLL_KINDS.find((k) => k.value === poll.kind)?.label ?? poll.kind;
  return (
    <FigurePanel
      className={cn(
        "flex flex-col p-4",
        poll.status === "live" && "border-brand-line",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-ink text-[14px] font-semibold leading-[1.35]">
          {poll.prompt}
        </p>
        <StatusBadge tone={TONE[poll.status]} label={STATUS[poll.status]} />
      </div>
      <p className="text-ink-3 mt-1 text-[12px]">
        {kind} · {poll.results.responses}{" "}
        {poll.results.responses === 1 ? "response" : "responses"}
      </p>
      <PollResults poll={poll} />
      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        {poll.status === "live" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => status.mutate({ id: poll.id, status: "closed" })}
            disabled={status.isPending}
          >
            <SquareIcon className="size-3.5" /> Close poll
          </Button>
        ) : (
          <Button
            size="sm"
            variant={poll.status === "draft" ? "default" : "outline"}
            onClick={gate.guard(() => status.mutate({ id: poll.id, status: "live", notify }))}
            disabled={status.isPending}
          >
            <PlayIcon className="size-3.5" />{" "}
            {poll.status === "draft" ? "Launch" : "Reopen"}
          </Button>
        )}
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`Remove poll ${poll.prompt}`}
          onClick={() => remove.mutate(poll.id)}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
    </FigurePanel>
  );
}

function NewPoll({ eventId, onDone }: { eventId: number; onDone: () => void }) {
  const { create } = usePollMutations(eventId);
  const [kind, setKind] = React.useState<Poll["kind"]>("choice");
  const [prompt, setPrompt] = React.useState("");
  const [options, setOptions] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const opts = options
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!prompt.trim()) return setError("Ask the room something.");
    if (kind === "choice" && opts.length < 2)
      return setError(
        "Give a multiple-choice poll at least two answers, one per line.",
      );
    setError(null);
    await create.mutateAsync({
      kind,
      prompt: prompt.trim(),
      options: kind === "choice" ? opts : [],
    });
    onDone();
  };
  return (
    <FigurePanel className="border-brand-line p-4">
      <form onSubmit={submit} noValidate className="grid gap-3">
        <CardLabel>New poll</CardLabel>
        <div className="flex flex-wrap gap-1.5">
          {POLL_KINDS.map((k) => (
            <Chip
              key={k.value}
              active={kind === k.value}
              onClick={() => setKind(k.value)}
            >
              {k.label}
            </Chip>
          ))}
        </div>
        <p className="text-ink-3 -mt-1 text-[12px]">
          {POLL_KINDS.find((k) => k.value === kind)?.hint}
        </p>
        <div>
          <label htmlFor="poll-prompt" className="eyebrow mb-1.5 block">
            Question
          </label>
          <input
            id="poll-prompt"
            className="input h-9 w-full"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={300}
            placeholder={
              kind === "words"
                ? "What are you building tonight?"
                : kind === "rating"
                  ? "Rate the keynote"
                  : "How comfortable are you with embedded C?"
            }
          />
        </div>
        {kind === "choice" ? (
          <div>
            <label htmlFor="poll-options" className="eyebrow mb-1.5 block">
              Answers, one per line
            </label>
            <textarea
              id="poll-options"
              className="input min-h-[96px] w-full py-2"
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              placeholder={
                "Never touched it\nA little\nComfortable\nI dream in pointers"
              }
            />
          </div>
        ) : null}
        {error ? <p className="text-refuse text-[12px]">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Saving…" : "Save as draft"}
          </Button>
        </div>
      </form>
    </FigurePanel>
  );
}

export function PollsPanel({
  eventId,
  checkedIn,
}: {
  eventId: number;
  /** The room's checked-in count, when the console already has it. */
  checkedIn?: number | null;
}) {
  const polls = usePolls(eventId);
  const [adding, setAdding] = React.useState(false);
  const [notify, setNotify] = useNotifyChoice(eventId, "poll");
  const gate = useFeatureGate("polls", { eventId });
  if (polls.isPending) return <Skeleton className="h-72" />;
  if (polls.isError || !polls.data)
    return (
      <EmptyState
        tone="muted"
        title="Polls could not load"
        description="Try again in a moment."
      />
    );
  const list = polls.data;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="page-title text-[20px]">Polls and word clouds</h2>
          <p className="text-ink-3 mt-1 text-[12.5px]">
            Launch one at a time — it appears on every attendee&apos;s phone and
            on the host screen.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {/* One switch for every Launch and Reopen below. */}
          <NotifySwitch
            checked={notify}
            onCheckedChange={setNotify}
            checkedIn={checkedIn}
            hint="A push to vote, as each poll launches"
          />
          <Button onClick={gate.guard(() => setAdding(true))} disabled={adding}>
            {gate.locked ? <LockIcon className="size-4" /> : <PlusIcon className="size-4" />} New poll
          </Button>
        </div>
      </div>
      {adding ? (
        <NewPoll eventId={eventId} onDone={() => setAdding(false)} />
      ) : null}
      {list.length === 0 && !adding ? (
        <EmptyState
          tone="muted"
          title="No polls yet"
          description="A word cloud to open the night, a multiple choice to take the room's pulse, a rating after each talk."
          action={
            <Button onClick={gate.guard(() => setAdding(true))}>Write the first</Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <PollCard key={p.id} eventId={eventId} poll={p} notify={notify} />
          ))}
        </div>
      )}
    </div>
  );
}
