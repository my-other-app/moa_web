"use client";

import * as React from "react";
import {
  CheckIcon,
  ChevronUpIcon,
  MonitorIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { relativeTime } from "@moa/app-kit";
import {
  Button,
  CardLabel,
  EmptyState,
  FigurePanel,
  Skeleton,
  Switch,
  cn,
} from "@moa/ui";

import { useQAMutations, useQuestions } from "../queries";
import type { ModerateAction, Question } from "../schemas";

/**
 * Live Q&A, as three columns: what waits for the organiser, what the room
 * sees and votes on, and what has been answered. One question at a time can
 * be pinned to the big screen.
 */
// The columns render dozens of buttons; the event id travels by context rather than props.
const EventIdContext = React.createContext(0);
const useEventIdFromContext = () => React.useContext(EventIdContext);

function Card({
  q,
  actions,
}: {
  q: Question;
  actions: {
    label: string;
    action: ModerateAction;
    icon: React.ReactNode;
    tone?: "refuse";
  }[];
}) {
  return (
    <li
      className={cn(
        "bg-surface border-line-soft rounded-xl border p-3",
        q.pinned && "border-brand-line",
      )}
    >
      <div className="flex gap-2.5">
        <div className="text-ink-3 flex shrink-0 flex-col items-center">
          <ChevronUpIcon className="size-3.5" aria-hidden="true" />
          <span
            className="font-mono text-[12px] tabular-nums"
            aria-label={`${q.votes} votes`}
          >
            {q.votes}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-ink text-[13px] leading-[1.45]">{q.text}</p>
          <p className="text-ink-3 mt-1 text-[11.5px]">
            {q.author_name || "Anonymous"} · {relativeTime(q.created_at)}
            {q.pinned ? (
              <span className="text-brand ml-1.5 font-mono text-[10px] tracking-[0.06em] uppercase">
                on screen
              </span>
            ) : null}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5" data-actions>
        {actions.map((a) => (
          <ActionButton key={a.action} q={q} {...a} />
        ))}
      </div>
    </li>
  );
}

function ActionButton({
  q,
  label,
  action,
  icon,
  tone,
}: {
  q: Question;
  label: string;
  action: ModerateAction;
  icon: React.ReactNode;
  tone?: "refuse";
}) {
  const { moderate } = useQAMutations(useEventIdFromContext());
  return (
    <Button
      size="xs"
      variant="outline"
      className={cn(tone === "refuse" && "text-refuse")}
      onClick={() => moderate.mutate({ id: q.id, action })}
      disabled={moderate.isPending}
    >
      {icon} {label}
    </Button>
  );
}

function Column({
  title,
  count,
  children,
  empty,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  empty: string;
}) {
  return (
    <FigurePanel className="p-3.5">
      <CardLabel
        right={
          <span className="bg-sunken text-ink-2 rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums">
            {count}
          </span>
        }
      >
        {title}
      </CardLabel>
      {count === 0 ? (
        <p className="text-ink-3 mt-3 text-[12.5px]">{empty}</p>
      ) : (
        <ul className="mt-3 grid gap-2">{children}</ul>
      )}
    </FigurePanel>
  );
}

export function QAPanel({ eventId }: { eventId: number }) {
  const board = useQuestions(eventId);
  const { approveFirst } = useQAMutations(eventId);
  if (board.isPending) return <Skeleton className="h-72" />;
  if (board.isError || !board.data)
    return (
      <EmptyState
        tone="muted"
        title="Questions could not load"
        description="Try again in a moment."
      />
    );
  const b = board.data;
  return (
    <EventIdContext.Provider value={eventId}>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="page-title text-[20px]">Live Q&amp;A</h2>
            <p className="text-ink-3 mt-1 text-[12.5px]">
              Attendees ask from the event page and upvote each other.{" "}
              {b.approve_first
                ? "New questions wait for approval."
                : "New questions go straight to the board."}
            </p>
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <Switch
              checked={b.approve_first}
              onCheckedChange={(v) => approveFirst.mutate(v)}
              aria-label="Approve before showing"
            />
            Approve before showing
          </label>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <Column
            title="To review"
            count={b.to_review.length}
            empty="Nothing waiting. New questions land here first."
          >
            {b.to_review.map((q) => (
              <Card
                key={q.id}
                q={q}
                actions={[
                  {
                    label: "Approve",
                    action: "approve",
                    icon: <CheckIcon className="size-3.5" />,
                  },
                  {
                    label: "Reject",
                    action: "reject",
                    icon: <XIcon className="size-3.5" />,
                    tone: "refuse",
                  },
                ]}
              />
            ))}
          </Column>
          <Column
            title="On the board"
            count={b.board.length}
            empty="The room sees these. Approve something to put it up."
          >
            {b.board.map((q) => (
              <Card
                key={q.id}
                q={q}
                actions={[
                  q.pinned
                    ? {
                        label: "Take off screen",
                        action: "unpin",
                        icon: <MonitorIcon className="size-3.5" />,
                      }
                    : {
                        label: "Pin to screen",
                        action: "pin",
                        icon: <MonitorIcon className="size-3.5" />,
                      },
                  {
                    label: "Answered",
                    action: "answered",
                    icon: <CheckIcon className="size-3.5" />,
                  },
                ]}
              />
            ))}
          </Column>
          <Column
            title="Answered"
            count={b.answered.length}
            empty="Mark a question answered once it has been."
          >
            {b.answered.map((q) => (
              <Card
                key={q.id}
                q={q}
                actions={[
                  {
                    label: "Reopen",
                    action: "reopen",
                    icon: <RotateCcwIcon className="size-3.5" />,
                  },
                ]}
              />
            ))}
          </Column>
        </div>
        {b.rejected > 0 ? (
          <p className="text-ink-3 text-[12px]">
            {b.rejected} {b.rejected === 1 ? "question" : "questions"} rejected.
          </p>
        ) : null}
      </div>
    </EventIdContext.Provider>
  );
}
