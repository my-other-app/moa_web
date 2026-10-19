"use client";

import * as React from "react";
import {
  BarChart3Icon,
  LockIcon,
  MessageCircleQuestionIcon,
  RadioIcon,
  StarIcon,
  ZapIcon,
} from "lucide-react";
import { Chip, cn } from "@moa/ui";

import { LockedNotice, useEventPlan } from "@/features/plan";

import {
  useFeedback,
  usePolls,
  useQuestions,
  useQuiz,
  useUpdates,
} from "../queries";
import { FeedbackPanel } from "./feedback-panel";
import { PollsPanel } from "./polls-panel";
import { QAPanel } from "./qa-panel";
import { QuizPanel } from "./quiz-panel";
import { UpdatesPanel } from "./updates-panel";

/**
 * The Live tab: five rooms behind five pills. Each pill carries the one
 * number the host glances at — questions written, questions waiting, a poll
 * up — so the state of the night reads from the row alone.
 */
export const VIEWS = ["quiz", "qa", "polls", "feedback", "updates"] as const;
export type View = (typeof VIEWS)[number];

/** The rooms that are plan features; feedback and live updates come with every plan. */
const VIEW_FEATURE: Partial<Record<View, string>> = { quiz: "quiz", qa: "qa", polls: "polls" };

const readView = (): View => {
  if (typeof window === "undefined") return "quiz";
  const v = new URLSearchParams(window.location.search).get("view");
  return (VIEWS as readonly string[]).includes(v ?? "") ? (v as View) : "quiz";
};

function Pill({
  active,
  onClick,
  icon,
  label,
  badge,
  tone,
  locked,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: string | null;
  tone?: "live" | "attention";
  /** Not on the plan: still opens, to read what is there. */
  locked?: boolean;
}) {
  return (
    <Chip active={active} onClick={onClick}>
      <span
        className={cn(
          active ? "text-brand-foreground" : "text-ink-3",
          "[&>svg]:size-3.5",
        )}
      >
        {icon}
      </span>
      {label}
      {badge ? (
        <span
          className={cn(
            "font-mono text-[10.5px]",
            active
              ? "text-brand-foreground/80"
              : tone === "live"
                ? "text-admit"
                : tone === "attention"
                  ? "text-caution"
                  : "text-ink-3",
          )}
        >
          {badge}
        </span>
      ) : null}
      {locked ? <LockIcon role="img" aria-label="Locked" className={cn("size-3", active ? "text-brand-foreground/80" : "text-ink-3")} /> : null}
    </Chip>
  );
}

export function LivePage({ eventId }: { eventId: number }) {
  const [view, setView] = React.useState<View>(readView);
  const quiz = useQuiz(eventId);
  const questions = useQuestions(eventId);
  const polls = usePolls(eventId);
  const feedback = useFeedback(eventId);
  const updates = useUpdates(eventId);
  // A grandfathered event keeps its live tools whatever the plan.
  const plan = useEventPlan(eventId);
  const locked = (v: View) => Boolean(VIEW_FEATURE[v]) && !plan.can(VIEW_FEATURE[v]!);
  const go = (v: View) => {
    setView(v);
    const url = new URL(window.location.href);
    url.searchParams.set("view", v);
    window.history.replaceState(null, "", url);
  };
  const nQ = quiz.data?.questions.length ?? 0;
  const review = questions.data?.to_review.length ?? 0;
  const live = polls.data?.some((p) => p.status === "live") ?? false;
  const replies = feedback.data?.results.responses ?? 0;
  const sent = updates.data?.items.length ?? 0;
  // Who a quiz or poll would notify: already in hand from the updates and feedback rooms.
  const checkedIn = updates.data?.audience.checked_in ?? feedback.data?.checked_in;
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Live">
        <Pill
          active={view === "quiz"}
          onClick={() => go("quiz")}
          locked={locked("quiz")}
          icon={<ZapIcon className="size-4" />}
          label="Quiz"
          badge={quiz.data?.status === "live" ? "live" : nQ ? `${nQ} Qs` : null}
          tone={quiz.data?.status === "live" ? "live" : undefined}
        />
        <Pill
          active={view === "qa"}
          onClick={() => go("qa")}
          locked={locked("qa")}
          icon={<MessageCircleQuestionIcon className="size-4" />}
          label="Q&A"
          badge={review ? `${review} to review` : null}
          tone="attention"
        />
        <Pill
          active={view === "polls"}
          onClick={() => go("polls")}
          locked={locked("polls")}
          icon={<BarChart3Icon className="size-4" />}
          label="Polls"
          badge={
            live ? "live" : polls.data?.length ? `${polls.data.length}` : null
          }
          tone={live ? "live" : undefined}
        />
        <Pill
          active={view === "feedback"}
          onClick={() => go("feedback")}
          icon={<StarIcon className="size-4" />}
          label="Feedback"
          badge={replies ? `${replies} replies` : null}
        />
        <Pill
          active={view === "updates"}
          onClick={() => go("updates")}
          icon={<RadioIcon className="size-4" />}
          label="Live updates"
          badge={sent ? `${sent} sent` : null}
        />
      </div>
      {VIEW_FEATURE[view] ? <LockedNotice feature={VIEW_FEATURE[view]!} eventId={eventId} /> : null}
      {view === "quiz" ? (
        <QuizPanel eventId={eventId} checkedIn={checkedIn} />
      ) : view === "qa" ? (
        <QAPanel eventId={eventId} />
      ) : view === "polls" ? (
        <PollsPanel eventId={eventId} checkedIn={checkedIn} />
      ) : view === "feedback" ? (
        <FeedbackPanel eventId={eventId} />
      ) : (
        <UpdatesPanel eventId={eventId} />
      )}
    </div>
  );
}
