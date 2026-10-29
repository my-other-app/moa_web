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
  useHostState,
  usePolls,
  useQuestions,
  useQuiz,
  useUpdates,
} from "../queries";
import { ConsoleBar, liveNow } from "./console-bar";
import { FeedbackPanel } from "./feedback-panel";
import { LockedRoom } from "./locked-room";
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

/**
 * The room to open: the one `?view=` names, until the host picks another.
 *
 * The URL cannot be read while the state is initialised. The server has no
 * query string, so the two renders disagreed — and React 19 keeps what the
 * server rendered rather than patching the difference, which left
 * `?view=polls` showing the polls room under a lit Quiz pill. So the URL is
 * an external store with its own server snapshot, which hydrates to "quiz"
 * and settles on the real one in the same commit.
 */
const subscribeToUrl = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
};

function useViewFromUrl() {
  const fromUrl = React.useSyncExternalStore(subscribeToUrl, readView, () => "quiz" as View);
  const [picked, setPicked] = React.useState<View | null>(null);
  return [picked ?? fromUrl, setPicked] as const;
}

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
  const [view, setView] = useViewFromUrl();
  const quiz = useQuiz(eventId);
  const questions = useQuestions(eventId);
  const polls = usePolls(eventId);
  const feedback = useFeedback(eventId);
  const updates = useUpdates(eventId);
  // A grandfathered event keeps its live tools whatever the plan.
  const plan = useEventPlan(eventId);
  const locked = (v: View) => Boolean(VIEW_FEATURE[v]) && !plan.can(VIEW_FEATURE[v]!);
  /**
   * Whether a room has nothing in it yet. Only then does a lock take the
   * whole room: anything already written stays on screen, under a notice.
   * Unknown (still loading) counts as not empty, so nothing flashes a lock
   * over work that is about to appear.
   */
  const empty = (v: View) =>
    v === "quiz"
      ? quiz.data?.questions.length === 0
      : v === "polls"
        ? polls.data?.length === 0
        : v === "qa"
          ? Boolean(
              questions.data &&
                questions.data.to_review.length === 0 &&
                questions.data.board.length === 0 &&
                questions.data.answered.length === 0,
            )
          : false;
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
  /*
   * The quiz's run, for the band at the top. The same query the quiz panel
   * drives, so the two share one cache entry and one poll; it only runs while
   * the quiz is on, and the band falls back to the quiz's own figures otherwise.
   */
  const running = quiz.data?.status === "live";
  const host = useHostState(eventId, running);
  const livePoll = polls.data?.find((p) => p.status === "live") ?? null;
  const onAir = liveNow({
    quizRunning: running,
    quizIndex: host.data?.current_index ?? quiz.data?.current_index ?? -1,
    quizTotal: host.data?.total ?? nQ,
    quizAnswered: host.data?.question?.answered ?? null,
    quizPlayers: host.data?.players ?? quiz.data?.players ?? 0,
    pollPrompt: livePoll?.prompt ?? null,
    pollResponses: livePoll?.results.responses ?? 0,
    // The floor is open once something is on the board, or once questions go up unapproved.
    qaOpen: Boolean(questions.data && (questions.data.board.length > 0 || !questions.data.approve_first)),
    qaOnBoard: questions.data?.board.length ?? 0,
  });
  return (
    <div className="grid gap-5">
      <ConsoleBar
        eventId={eventId}
        onAir={onAir}
        checkedIn={checkedIn}
        registered={updates.data?.audience.registered}
      />
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
      {/*
       * A room the plan does not include: with nothing in it yet, the whole
       * room is the designed locked state rather than a notice over an empty
       * editor. With work already in it, the notice stands above and the work
       * stays readable.
       */}
      {VIEW_FEATURE[view] && locked(view) && empty(view) ? (
        <LockedRoom feature={VIEW_FEATURE[view]!} eventId={eventId} />
      ) : (
        <>
          {VIEW_FEATURE[view] ? <LockedNotice feature={VIEW_FEATURE[view]!} eventId={eventId} /> : null}
          {view === "quiz" ? (
            <QuizPanel eventId={eventId} checkedIn={checkedIn} />
          ) : view === "qa" ? (
            <QAPanel eventId={eventId} checkedIn={checkedIn} />
          ) : view === "polls" ? (
            <PollsPanel eventId={eventId} checkedIn={checkedIn} />
          ) : view === "feedback" ? (
            <FeedbackPanel eventId={eventId} />
          ) : (
            <UpdatesPanel eventId={eventId} />
          )}
        </>
      )}
    </div>
  );
}
