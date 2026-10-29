"use client";

import * as React from "react";
import { MaximizeIcon, MinimizeIcon } from "lucide-react";
import { Skeleton, cn } from "@moa/ui";

import { useEventDetail } from "@/features/events/queries";

import { useScreen } from "../queries";
import { roomAddress, roomUrl } from "../room";
import { JoinQr } from "./join-qr";

/**
 * The present view: what a club casts to the projector while the room fills
 * and while the quiz runs.
 *
 * It is deliberately not the host screen (screen-page): that one carries the
 * board, the pinned question, the poll and the update strip — everything at
 * once, at reading distance. This carries the one thing somebody at the back
 * of a hall has to act on, in type big enough to act on it from there:
 *
 *   before the quiz   the join QR and the address, as large as the screen allows
 *   quiz in its lobby the join code at 200px beside the QR, and the count filling
 *   a question open   the question and its answers, the QR shrunk to a corner so
 *                     latecomers can still get in, the timer and the answered count
 *   between questions the top ten
 *
 * Nothing here writes: it reads the same `/live/screen` the host screen does.
 * Ties share a rank (the backend's board.py), so rows are keyed by rank and
 * name together, never rank alone.
 */

/** The marks beside each answer, the same ones the console and the phones use. */
const MARK = ["▲", "◆", "●", "■", "★", "✚"];

/** The screen is cast from a laptop; this is the one control on it. */
function FullScreenButton() {
  const [full, setFull] = React.useState(false);
  React.useEffect(() => {
    const sync = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      // Out of the way on the projector; back on a keypress or a nudge of the mouse.
      className="btn btn-secondary btn-sm fixed top-5 right-5 z-10 opacity-0 transition-opacity focus-visible:opacity-100 hover:opacity-100"
    >
      {full ? <MinimizeIcon className="size-3.5" /> : <MaximizeIcon className="size-3.5" />}
      {full ? "Leave full screen" : "Full screen"}
    </button>
  );
}

/**
 * How big the join QR can be drawn here. A projector is 1920×1080 or
 * 1280×720 and the code has to be read from the back row, so it takes as
 * much of the shorter side as the rest of the screen can spare — and is
 * re-measured when the window changes, because a host drags this between
 * a laptop screen and a projector mid-event.
 */
export function qrSize(width: number, height: number, beside: boolean) {
  const room = beside ? Math.min(width * 0.26, height * 0.42) : Math.min(width * 0.34, height * 0.62);
  return Math.round(Math.max(beside ? 130 : 240, Math.min(beside ? 240 : 560, room)));
}

function useQrSize(beside: boolean) {
  // Server-rendered and first paint: the size the old screen used, replaced on mount.
  const [size, setSize] = React.useState(() => (beside ? 180 : 420));
  React.useEffect(() => {
    const measure = () => setSize(qrSize(window.innerWidth, window.innerHeight, beside));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [beside]);
  return size;
}

function Counter({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <p className="grid gap-1">
      <span className="text-brand font-mono text-[clamp(32px,4vw,64px)] leading-none font-semibold tabular-nums">
        {value}
      </span>
      <span className="text-ink-3 font-mono text-[13px] tracking-[0.12em] uppercase">{label}</span>
    </p>
  );
}

export function PresentPage({ eventId }: { eventId: number }) {
  const screen = useScreen(eventId);
  const detail = useEventDetail(eventId);
  const s = screen.data;
  // The address needs the slug, which lives on the event's detail; until it
  // arrives the legacy /{id}/live address resolves to the same room.
  const event = { id: eventId, slug: detail.data?.slug };
  const url = roomUrl(event);
  const address = roomAddress(event);
  const name = s?.event.name ?? detail.data?.name ?? "";
  const asking = Boolean(s?.quiz?.question);
  const size = useQrSize(asking);

  if (!s) return <Skeleton className="m-10 h-[80vh]" />;

  const quiz = s.quiz;
  const question = quiz?.question ?? null;

  return (
    <main className="bg-canvas text-ink grid min-h-dvh grid-rows-[auto_1fr_auto] gap-6 px-[4vw] py-[3vh]">
      <FullScreenButton />

      <header className="flex items-baseline justify-between gap-8">
        <h1 className="min-w-0 truncate text-[clamp(20px,2.2vw,38px)] font-semibold tracking-[-0.02em]">
          {name}
        </h1>
        <p className="flex shrink-0 items-center gap-2.5">
          <span className="bg-admit size-2.5 rounded-full" aria-hidden="true" />
          <span className="text-ink-3 font-mono text-[clamp(11px,0.9vw,15px)] tracking-[0.18em] uppercase">
            Live
          </span>
        </p>
      </header>

      {asking && question ? (
        /* A question is open: it takes the screen, the QR keeps its corner. */
        <section className="grid min-h-0 gap-[3vw] lg:grid-cols-[1fr_auto]">
          <div className="flex min-w-0 flex-col justify-center">
            <p className="text-ink-3 font-mono text-[clamp(13px,1.1vw,20px)] tracking-[0.14em] uppercase">
              Question {quiz!.current_index + 1} of {quiz!.total}
            </p>
            <h2 className="mt-[1.5vh] text-[clamp(32px,4.4vw,84px)] leading-[1.08] font-semibold tracking-[-0.025em]">
              {question.prompt}
            </h2>
            <ul className="mt-[3vh] grid gap-[1.2vh] sm:grid-cols-2">
              {question.counts.map((c, i) => (
                <li
                  key={c.key}
                  className={cn(
                    "bg-surface flex items-center gap-5 rounded-2xl px-6 py-[1.6vh] text-[clamp(18px,1.9vw,36px)]",
                    question.time_left === 0 && c.correct && "ring-admit bg-admit-soft ring-4",
                  )}
                >
                  <span className="text-brand shrink-0 font-mono text-[0.8em]" aria-hidden="true">
                    {MARK[i]}
                  </span>
                  <span className="min-w-0 flex-1">{c.label}</span>
                  {question.time_left === 0 ? (
                    <span className="text-ink-3 shrink-0 font-mono tabular-nums">{c.count}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
          <aside className="flex flex-col items-center justify-center gap-[3vh]">
            <Counter
              value={question.time_left === 0 ? "Time" : `${question.time_left}s`}
              label={question.time_left === 0 ? "Answers in" : "Left"}
            />
            <Counter value={`${question.answered}/${quiz!.players}`} label="Answered" />
            <JoinQr url={url} address={address} size={size} label="Late? Scan to join" />
          </aside>
        </section>
      ) : (
        /* Nobody is being asked anything: the way in takes the screen. */
        <section className="grid min-h-0 items-center gap-[4vw] lg:grid-cols-[auto_1fr]">
          <JoinQr url={url} address={address} size={size} label="Scan to join" />
          <div className="grid min-w-0 gap-[3vh]">
            {quiz ? (
              <div>
                <p className="text-ink-3 font-mono text-[clamp(13px,1.1vw,20px)] tracking-[0.14em] uppercase">
                  {quiz.status === "ended" ? "That's the quiz" : `${quiz.title} — join with this code`}
                </p>
                {quiz.status === "ended" ? null : (
                  <p
                    className="text-brand mt-[1vh] font-mono text-[clamp(64px,11vw,220px)] leading-[0.92] font-semibold tracking-[0.08em] tabular-nums"
                    aria-label={`Join code ${quiz.join_code ?? ""}`}
                  >
                    {quiz.join_code}
                  </p>
                )}
                <p className="text-ink-2 mt-[1.5vh] text-[clamp(16px,1.6vw,30px)]">
                  {quiz.players} {quiz.players === 1 ? "player" : "players"} in
                </p>
              </div>
            ) : (
              <div>
                <p className="text-[clamp(26px,3.2vw,58px)] leading-[1.15] font-semibold tracking-[-0.02em]">
                  Join the room from your phone
                </p>
                <p className="text-ink-2 mt-[2vh] text-[clamp(16px,1.6vw,28px)] leading-[1.4]">
                  Point your camera at the code — no app to install. Ask questions, vote
                  in polls and play along from there.
                </p>
              </div>
            )}

            {quiz && quiz.leaderboard.length > 0 ? (
              <ol className="grid gap-[0.8vh]">
                {quiz.leaderboard.slice(0, 10).map((p) => (
                  <li
                    key={`${p.rank}-${p.name}`}
                    className="flex items-baseline gap-5 text-[clamp(15px,1.5vw,28px)]"
                  >
                    <span className="text-ink-3 w-[2.2em] shrink-0 font-mono text-[0.78em] tabular-nums">
                      {p.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="shrink-0 font-mono tabular-nums">{p.score}</span>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        </section>
      )}

      <footer className="min-h-[6vh]">
        {s.update ? (
          <p className="bg-brand-soft border-brand-line text-ink flex items-baseline gap-4 rounded-2xl border px-6 py-[1.4vh] text-[clamp(15px,1.5vw,28px)]">
            <span className="text-brand shrink-0 font-mono text-[0.6em] tracking-[0.12em] uppercase">
              Update
            </span>
            <span className="min-w-0">{s.update.text}</span>
          </p>
        ) : null}
      </footer>
    </main>
  );
}
