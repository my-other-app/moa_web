"use client";

import * as React from "react";
import Link from "next/link";
import { BarChart3Icon, MessageCircleQuestionIcon, ZapIcon } from "lucide-react";
import { Button, FigurePanel, cn } from "@moa/ui";

import { LockBadge, UPGRADE_PATH, useFeatureGate } from "@/features/plan";

/**
 * A live room the club's plan does not include.
 *
 * The bare notice above the panel was true but useless mid-event: it said
 * "not on your plan" over an empty editor with a disabled button, and left
 * the host to work out what they were missing. This says what the thing
 * does in a hall, which plan has it, and nothing else — and it is shown
 * only when there is nothing already here. A room with work in it keeps its
 * own screen, with the notice above, so what was written before the plan
 * changed stays readable.
 */
const ROOMS: Record<string, { icon: React.ReactNode; title: string; does: string; aside: string }> = {
  quiz: {
    icon: <ZapIcon />,
    title: "Run a quiz on the room's phones",
    does: "Four to six questions, a code on the projector, and a leaderboard that fills in as people answer. Scores reward fast correct answers.",
    aside: "Nobody installs anything: they scan the code on the screen.",
  },
  polls: {
    icon: <BarChart3Icon />,
    title: "Ask the room and show the answer",
    does: "Multiple choice, a word cloud or a 1–5 rating. One poll is up at a time, on every phone and on the big screen, and the bars fill as votes land.",
    aside: "A word cloud to open the night; a rating after each talk.",
  },
  qa: {
    icon: <MessageCircleQuestionIcon />,
    title: "Take questions from the floor",
    does: "People ask from the event page and upvote each other. You approve what goes up, pin one to the big screen, and mark it answered.",
    aside: "Quieter rooms ask far more here than they do out loud.",
  },
};

export function LockedRoom({
  feature,
  eventId,
  className,
}: {
  feature: string;
  eventId: number;
  className?: string;
}) {
  const gate = useFeatureGate(feature, { eventId });
  const room = ROOMS[feature];
  if (!gate.lock || !room) return null;
  const plan = gate.lock.requiredPlanName;
  return (
    <FigurePanel className={cn("border-brand-line grid gap-5 border p-7 sm:grid-cols-[1fr_auto] sm:items-center", className)}>
      <div className="min-w-0">
        <p className="flex items-center gap-2.5">
          <span className="bg-brand-soft text-brand grid size-9 shrink-0 place-items-center rounded-xl [&>svg]:size-4.5">
            {room.icon}
          </span>
          <LockBadge lock={gate.lock} />
        </p>
        <h2 className="page-title mt-3 text-[19px]">{room.title}</h2>
        <p className="text-ink-2 mt-2 max-w-[62ch] text-[13px] leading-[1.55]">{room.does}</p>
        <p className="text-ink-3 mt-1.5 text-[12.5px]">{room.aside}</p>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
        <p className="text-ink-3 text-[12.5px]">
          {plan ? (
            <>
              Part of <strong className="text-ink font-semibold">{plan}</strong> and up
            </>
          ) : (
            "Not on your plan"
          )}
        </p>
        <div className="flex gap-2">
          <Button onClick={gate.prompt}>See what changes</Button>
          <Link href={UPGRADE_PATH} className="btn btn-secondary">
            Plans
          </Link>
        </div>
      </div>
    </FigurePanel>
  );
}
