"use client";

import { ChevronUpIcon } from "lucide-react";
import { Skeleton, cn } from "@moa/ui";

import { useScreen } from "../queries";
import { PollResults } from "./polls-panel";

/**
 * The screen at the front of the room, refreshed every few seconds: the
 * pinned question large, the board, the poll that is up, the quiz if it
 * runs (its join code in the lobby, the tally during a question, the board
 * at the end), and the last update as a strip along the bottom.
 */
const MARK = ["▲", "◆", "●", "■", "★", "✚"];

export function ScreenPage({ eventId }: { eventId: number }) {
  const screen = useScreen(eventId);
  const s = screen.data;
  if (!s) return <Skeleton className="m-8 h-96" />;
  const quiz = s.quiz;
  const nothing = !s.pinned && s.board.length === 0 && !s.poll && !quiz;
  return (
    <main className="bg-canvas text-ink grid min-h-dvh grid-rows-[auto_1fr_auto] px-10 py-8">
      <header className="flex items-baseline justify-between gap-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{s.event.name}</h1>
        <span className="eyebrow">Live</span>
      </header>

      <section className={cn("grid items-start gap-8 py-8", quiz || s.poll ? "lg:grid-cols-[1.3fr_1fr]" : "")}>
        {quiz ? (
          <div className="bg-surface shadow-card rounded-[var(--radius-sheet)] p-10">
            {quiz.question ? (
              <>
                <p className="eyebrow">
                  Question {quiz.current_index + 1} of {quiz.total} · {quiz.question.time_left === 0 ? "time" : `${quiz.question.time_left}s`}
                </p>
                <p className="mt-3 text-[40px] leading-[1.15] font-semibold tracking-[-0.02em]">{quiz.question.prompt}</p>
                <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                  {quiz.question.counts.map((c, i) => (
                    <li key={c.key} className={cn("bg-sunken flex items-center gap-4 rounded-xl px-5 py-4 text-[22px]", quiz.question!.time_left === 0 && c.correct && "ring-admit ring-2")}>
                      <span className="text-brand font-mono text-[18px]" aria-hidden="true">
                        {MARK[i]}
                      </span>
                      <span className="flex-1">{c.label}</span>
                      {quiz.question!.time_left === 0 ? <span className="text-ink-3 font-mono text-[16px] tabular-nums">{c.count}</span> : null}
                    </li>
                  ))}
                </ul>
                <p className="text-ink-3 mt-6 text-[16px]">
                  {quiz.question.answered} of {quiz.players} answered
                </p>
              </>
            ) : quiz.status === "live" ? (
              <>
                <p className="eyebrow">{quiz.title}</p>
                <p className="mt-3 text-[28px] font-semibold">Join on your phone with this code</p>
                <p className="text-brand mt-6 font-mono text-[96px] leading-none font-semibold tracking-[0.2em]">{quiz.join_code}</p>
                <p className="text-ink-3 mt-6 text-[18px]">
                  {quiz.players} {quiz.players === 1 ? "player" : "players"} in
                </p>
              </>
            ) : null}
          </div>
        ) : s.pinned ? (
          <div className="bg-surface shadow-card rounded-[var(--radius-sheet)] p-10">
            <p className="eyebrow">From the floor</p>
            <p className="mt-4 text-[44px] leading-[1.15] font-semibold tracking-[-0.02em]">{s.pinned.text}</p>
            <p className="text-ink-3 mt-5 text-[18px]">
              {s.pinned.author_name || "Anonymous"} · {s.pinned.votes} {s.pinned.votes === 1 ? "vote" : "votes"}
            </p>
          </div>
        ) : s.board.length > 0 ? (
          <div>
            <p className="eyebrow">Questions from the floor</p>
            <ul className="mt-4 grid gap-3">
              {s.board.map((q) => (
                <li key={q.id} className="bg-surface shadow-card flex items-start gap-5 rounded-2xl px-6 py-5">
                  <span className="text-ink-3 flex shrink-0 flex-col items-center font-mono text-[18px] tabular-nums">
                    <ChevronUpIcon className="size-5" aria-hidden="true" />
                    {q.votes}
                  </span>
                  <p className="text-[24px] leading-[1.3]">{q.text}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : nothing ? (
          <p className="text-ink-3 self-center text-center text-[22px]">Nothing on the screen yet. Pin a question, launch a poll or host the quiz from the console.</p>
        ) : null}

        {quiz && quiz.leaderboard.length > 0 ? (
          <div className="bg-surface shadow-card rounded-[var(--radius-sheet)] p-8">
            <p className="eyebrow">Leaderboard</p>
            <ol className="mt-4 grid gap-2.5">
              {quiz.leaderboard.slice(0, 8).map((p) => (
                <li key={p.rank} className="flex items-center gap-4 text-[22px]">
                  <span className="text-ink-3 w-8 font-mono text-[16px] tabular-nums">{p.rank}</span>
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="font-mono text-[18px] tabular-nums">{p.score}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : s.poll ? (
          <div className="bg-surface shadow-card rounded-[var(--radius-sheet)] p-8 text-[18px]">
            <p className="eyebrow">Poll · {s.poll.results.responses} answered</p>
            <p className="mt-3 text-[26px] font-semibold leading-[1.25]">{s.poll.prompt}</p>
            <PollResults poll={s.poll} compact />
          </div>
        ) : null}
      </section>

      <footer className="min-h-[56px]">
        {s.update ? (
          <p className="bg-brand-soft border-brand-line text-ink rounded-xl border px-5 py-3.5 text-[18px]">
            <span className="text-brand mr-3 font-mono text-[11px] tracking-[0.08em] uppercase">Update</span>
            {s.update.text}
          </p>
        ) : null}
      </footer>
    </main>
  );
}
