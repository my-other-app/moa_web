"use client";

import * as React from "react";
import Link from "next/link";
import {
  BarChart3Icon,
  BellIcon,
  BellOffIcon,
  MessageCircleQuestionIcon,
  MonitorIcon,
  PresentationIcon,
  ZapIcon,
} from "lucide-react";
import { cn } from "@moa/ui";

import { useNotifyBudget } from "../notify";
import { NOTIFY_PER_DAY, NOTIFY_RULE } from "../schemas";

/**
 * The band across the top of the Live tab: what the room is seeing right
 * now, how many people are in it, what is left of the room's attention, and
 * the two ways onto the projector.
 *
 * It exists because the console's five rooms each know one thing and the
 * host, mid-event, needs all of them at a glance: a poll left open under
 * another pill is invisible until somebody asks why their phone is still
 * showing it.
 */

/** One thing the room is seeing, with the one number that matters about it. */
export interface OnAir {
  key: string;
  icon: React.ReactNode;
  /** What it is: "Quiz", "Poll", "Q&A". */
  what: string;
  /** Where it has got to: "Question 3 of 6", "64 answered". */
  detail: string;
}

export function liveNow({
  quizRunning,
  quizIndex,
  quizTotal,
  quizAnswered,
  quizPlayers,
  pollPrompt,
  pollResponses,
  qaOpen,
  qaOnBoard,
}: {
  quizRunning: boolean;
  quizIndex: number;
  quizTotal: number;
  quizAnswered: number | null;
  quizPlayers: number;
  pollPrompt: string | null;
  pollResponses: number;
  qaOpen: boolean;
  qaOnBoard: number;
}): OnAir[] {
  const on: OnAir[] = [];
  if (quizRunning)
    on.push({
      key: "quiz",
      icon: <ZapIcon className="size-3.5" />,
      what: "Quiz",
      detail:
        quizIndex < 0
          ? `lobby · ${quizPlayers} ${quizPlayers === 1 ? "player" : "players"} in`
          : `question ${quizIndex + 1} of ${quizTotal}${quizAnswered === null ? "" : ` · ${quizAnswered} of ${quizPlayers} answered`}`,
    });
  if (pollPrompt !== null)
    on.push({
      key: "poll",
      icon: <BarChart3Icon className="size-3.5" />,
      what: "Poll",
      detail: `${pollPrompt} · ${pollResponses} answered`,
    });
  if (qaOpen)
    on.push({
      key: "qa",
      icon: <MessageCircleQuestionIcon className="size-3.5" />,
      what: "Q&A",
      detail: qaOnBoard ? `${qaOnBoard} on the board` : "open, nothing up yet",
    });
  return on;
}

/** mm:ss for a wait a host is watching tick down. */
export function countdown(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Dot({ on }: { on: boolean }) {
  return (
    <span className="relative flex size-2.5 shrink-0" aria-hidden="true">
      {on ? (
        <span className="bg-admit absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:animate-none" />
      ) : null}
      <span className={cn("relative inline-flex size-2.5 rounded-full", on ? "bg-admit" : "bg-ink-3/40")} />
    </span>
  );
}

export function ConsoleBar({
  eventId,
  onAir,
  checkedIn,
  registered,
  className,
}: {
  eventId: number;
  onAir: OnAir[];
  /** Who is in the hall; null while the console has not read it. */
  checkedIn?: number | null;
  registered?: number | null;
  className?: string;
}) {
  const budget = useNotifyBudget(eventId);
  const live = onAir.length > 0;
  const left = NOTIFY_PER_DAY - budget.sentToday;
  return (
    <section
      aria-label="What the room is seeing"
      className={cn(
        "rounded-2xl border px-4 py-3",
        live ? "border-admit-line bg-admit-soft/50" : "border-line bg-sunken/60",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <p className="flex items-center gap-2">
          <Dot on={live} />
          <span
            className={cn(
              "font-mono text-[10.5px] font-semibold tracking-[0.1em] uppercase",
              live ? "text-admit" : "text-ink-3",
            )}
          >
            {live ? "On air" : "Nothing on air"}
          </span>
        </p>

        <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" aria-live="polite">
          {onAir.map((item) => (
            <li
              key={item.key}
              className="bg-surface border-line-soft text-ink flex max-w-full items-center gap-1.5 rounded-full border py-1 pr-3 pl-2.5 text-[12.5px]"
            >
              <span className="text-admit shrink-0">{item.icon}</span>
              <span className="font-medium">{item.what}</span>
              <span className="text-ink-3 truncate">{item.detail}</span>
            </li>
          ))}
          {live ? null : (
            <li className="text-ink-3 text-[12.5px]">
              Nobody&apos;s phone is showing anything from this console yet.
            </li>
          )}
        </ul>

        <div className="flex shrink-0 items-center gap-2">
          <Link href={`/present/${eventId}`} target="_blank" className="btn btn-primary btn-sm">
            <PresentationIcon className="size-3.5" /> Present
          </Link>
          <Link href={`/screen/${eventId}`} target="_blank" className="btn btn-secondary btn-sm">
            <MonitorIcon className="size-3.5" /> Big screen
          </Link>
        </div>
      </div>

      <div className="border-line-soft text-ink-3 mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2.5 text-[12px]">
        <span className="text-ink-2">
          <strong className="text-ink font-mono font-semibold tabular-nums">{checkedIn ?? "—"}</strong>
          {registered != null ? <> of <span className="font-mono tabular-nums">{registered}</span></> : null} checked in
        </span>
        <span className="flex items-center gap-1.5">
          {budget.spent ? <BellOffIcon className="size-3.5" aria-hidden="true" /> : <BellIcon className="size-3.5" aria-hidden="true" />}
          <span>
            {NOTIFY_RULE}{" "}
            {budget.spent ? (
              <span className="text-caution">Today&apos;s ten are gone — the room is not pushed again until tomorrow.</span>
            ) : budget.waitSeconds > 0 ? (
              <span className="text-caution">Next one in {countdown(budget.waitSeconds)}.</span>
            ) : budget.sentToday > 0 ? (
              <span>
                {budget.sentToday} sent from this console · <span className="tabular-nums">{left}</span> left today.
              </span>
            ) : (
              <span>None sent from this console yet.</span>
            )}
          </span>
        </span>
      </div>
    </section>
  );
}
