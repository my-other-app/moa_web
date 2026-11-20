"use client";

import * as React from "react";
import { CheckIcon, PauseIcon } from "lucide-react";

import { phaseOf, type HostState, type ScreenControl, type Theme } from "../schemas";
import { AnswerTiles, Board, Eyebrow, Panel, Podium, TeamBoard, Timer, t, u, useCountdown, type TileStyle } from "./parts";

/**
 * The quiz on the big screen, through every phase of a round (CONTRACT
 * 5.4): the lobby and its code, a question with its clock and answers in
 * the theme's style, paused, closed (answers in, waiting for the host),
 * revealed (the right answer, and the board when the round says so), and
 * the end (a podium, the teams, the board across rounds).
 *
 * The screen is never told the answer before the players are: the server
 * hides it (for_screen), and this only marks what it was given.
 */

export interface StageLook {
  /** The theme, or null for the screen's own (Meridian) look. */
  theme: Theme | null;
  tiles: TileStyle;
  layout: "grid" | "column";
  timer: Theme["timer"];
  boardSize: number;
  podium: boolean;
  animate: boolean;
}

const KIND_HINT: Record<string, string> = {
  multi: "Pick every right answer",
  true_false: "True or false?",
  type: "Type your answer on your phone",
  order: "Put these in order on your phone",
  poll: "No right answer — tell us what you think",
};

function Lobby({ quiz, joinBig, join }: { quiz: HostState; joinBig: boolean; join: React.ReactNode }) {
  return (
    <div className={joinBig ? "grid h-full items-center" : "flex h-full flex-col justify-center"} style={joinBig ? { gridTemplateColumns: "auto 1fr", gap: u(5) } : undefined}>
      {joinBig ? join : null}
      <div className="min-w-0">
        <Eyebrow>{quiz.title}</Eyebrow>
        <p className="font-semibold" style={{ marginTop: u(1), fontSize: t(3.2), fontFamily: "var(--lt-font-display)" }}>
          Join on your phone with this code
        </p>
        <p
          className="font-mono leading-none font-semibold tabular-nums"
          style={{ marginTop: u(2), fontSize: t(11), letterSpacing: "0.12em", color: "var(--lt-accent)" }}
          aria-label={`Join code ${quiz.join_code ?? ""}`}
        >
          {quiz.join_code}
        </p>
        <p style={{ marginTop: u(2), fontSize: t(2.2), color: "var(--lt-muted)" }}>
          {quiz.players} {quiz.players === 1 ? "player" : "players"} in
          {quiz.round && quiz.round.count > 1 ? ` · round ${quiz.round.index + 1} of ${quiz.round.count}` : ""}
        </p>
      </div>
    </div>
  );
}

function TypedResults({ q }: { q: NonNullable<HostState["question"]> }) {
  const accepted = q.accepted ?? [];
  return (
    <div className="grid" style={{ gap: u(2) }}>
      {accepted.length ? (
        <div>
          <Eyebrow>The answer</Eyebrow>
          <p className="font-semibold" style={{ marginTop: u(0.6), fontSize: t(4.2), fontFamily: "var(--lt-font-display)", color: "var(--lt-accent)" }}>
            {accepted[0]}
          </p>
          {accepted.length > 1 ? (
            <p style={{ fontSize: t(1.6), color: "var(--lt-muted)" }}>Also right: {accepted.slice(1).join(" · ")}</p>
          ) : null}
        </div>
      ) : null}
      {q.texts && q.texts.length ? (
        <ul className="grid grid-cols-2" style={{ gap: u(0.8) }} aria-label="What the room typed">
          {q.texts.map((x) => (
            <li key={x.text} className="flex items-center rounded-[0.6em]" style={{ gap: u(1), padding: `${u(0.7)} ${u(1.3)}`, fontSize: t(1.9), background: "var(--lt-panel)" }}>
              {x.correct ? <CheckIcon aria-label="Right" style={{ width: "1em", height: "1em", color: "var(--lt-accent)" }} /> : null}
              <span className="min-w-0 flex-1 truncate">{x.text}</span>
              <span className="font-mono tabular-nums" style={{ color: "var(--lt-muted)" }}>
                {x.count}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function QuestionBody({ quiz, look, control, revealed, narrow }: { quiz: HostState; look: StageLook; control: ScreenControl | null; revealed: boolean; narrow: boolean }) {
  const q = quiz.question!;
  const kind = q.kind ?? "single";
  // "Question + live results": the tally fills in as answers land; "question only": it waits for the reveal.
  const showCounts = revealed || (control?.results ?? "live") === "live";
  if (kind === "type")
    return revealed ? (
      <TypedResults q={q} />
    ) : (
      <Panel className="grid place-items-center text-center" style={{ minHeight: u(14) }}>
        <p style={{ fontSize: t(2.6) }}>{KIND_HINT.type}</p>
      </Panel>
    );
  if (kind === "order") {
    // Before the reveal the screen shows the shuffled order every phone has; after it, the right one.
    const byKey = new Map(q.options.map((o) => [o.key, o]));
    const shown = revealed && q.correct_order ? q.correct_order.map((k) => byKey.get(k)).filter((o): o is NonNullable<typeof o> => Boolean(o)) : q.options;
    return (
      <AnswerTiles
        options={shown}
        counts={q.counts}
        style={look.tiles}
        layout="column"
        showCounts={revealed}
        revealed={false}
        correct={new Set()}
        answered={q.answered}
        order
      />
    );
  }
  const correct = new Set(
    kind === "poll" ? [] : kind === "multi" ? (q.correct_keys ?? q.counts.filter((c) => c.correct).map((c) => c.key)) : q.counts.filter((c) => c.correct).map((c) => c.key),
  );
  return (
    <AnswerTiles
      options={q.options}
      counts={q.counts}
      style={look.tiles}
      layout={narrow ? "column" : kind === "true_false" ? "grid" : look.layout}
      showCounts={showCounts}
      revealed={revealed}
      correct={correct}
      answered={q.answered}
    />
  );
}

function Question({ quiz, look, control }: { quiz: HostState; look: StageLook; control: ScreenControl | null }) {
  const q = quiz.question!;
  const phase = phaseOf(quiz);
  const paused = phase === "paused";
  const revealed = phase === "revealed";
  const closed = phase === "closed";
  const left = useCountdown(q.time_left, phase === "question");
  const kind = q.kind ?? "single";
  const board = revealed && Boolean(quiz.board_now) && quiz.leaderboard.length > 0;
  const points = q.effective_points;
  return (
    <div className="grid h-full min-h-0 items-start" style={board ? { gridTemplateColumns: "1.35fr 1fr", gap: u(3) } : undefined}>
      <div className="flex min-w-0 flex-col" style={{ gap: u(1.3) }}>
        <div className="flex items-center justify-between" style={{ gap: u(2) }}>
          <Eyebrow>
            Question {quiz.current_index + 1} of {quiz.total}
            {quiz.round && quiz.round.count > 1 ? ` · round ${quiz.round.index + 1}` : ""}
            {kind !== "poll" && points ? ` · ${points} points` : ""}
            {q.double ? " · double points" : ""}
          </Eyebrow>
          <div className="flex shrink-0 items-center" style={{ gap: u(2) }}>
            <p className="text-right" style={{ fontSize: t(1.6), color: "var(--lt-muted)" }} aria-live="polite">
              {q.answered} of {quiz.players} answered
              {revealed && q.fully_correct != null && kind !== "poll" ? <span className="block">{q.fully_correct} got it fully right</span> : null}
            </p>
            {look.timer !== "bar" && !revealed && !closed ? <Timer style={look.timer} left={left} seconds={q.seconds} paused={paused} /> : null}
          </div>
        </div>
        {look.timer === "bar" && !revealed ? <Timer style="bar" left={left} seconds={q.seconds} paused={paused} /> : null}
        <h2 className="leading-[1.1] font-semibold tracking-[-0.02em]" style={{ fontSize: t(board ? 3.2 : 3.9), fontFamily: "var(--lt-font-display)" }}>
          {q.prompt}
        </h2>
        {KIND_HINT[kind] && kind !== "type" ? <p style={{ fontSize: t(1.6), color: "var(--lt-muted)" }}>{KIND_HINT[kind]}</p> : null}
        <QuestionBody quiz={quiz} look={look} control={control} revealed={revealed} narrow={board} />
      </div>
      {board ? (
        <div className="grid min-w-0" style={{ gap: u(3) }}>
          {quiz.teams && quiz.teams.length ? <TeamBoard teams={quiz.teams} /> : null}
          <Board rows={quiz.leaderboard} size={look.boardSize} animate={look.animate} teams={quiz.teams} />
        </div>
      ) : null}
      {paused || closed ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[12%] flex justify-center">
          <p
            className="flex items-center rounded-full font-semibold shadow-lg"
            style={{ gap: u(1), padding: `${u(1)} ${u(2.6)}`, fontSize: t(2.2), background: "var(--lt-accent)", color: "var(--lt-on-accent)" }}
            role="status"
          >
            {paused ? <PauseIcon aria-hidden="true" style={{ width: "1em", height: "1em" }} /> : null}
            {paused ? "Paused" : "Answers are in — the answer is next"}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Finished({ quiz, look }: { quiz: HostState; look: StageLook }) {
  const rows = quiz.leaderboard;
  const overall = quiz.overall && quiz.overall.length ? quiz.overall : null;
  const teams = quiz.teams && quiz.teams.length ? quiz.teams : null;
  const side = Boolean(teams || overall);
  const podium = look.podium && rows.length > 0;
  return (
    <div className="grid h-full min-h-0 content-start" style={{ gap: u(2.2) }}>
      <div className="flex flex-wrap items-baseline" style={{ gap: u(2) }}>
        <p className="font-semibold" style={{ fontSize: t(3), fontFamily: "var(--lt-font-display)" }}>
          {quiz.round && quiz.round.count > 1 ? `That's ${quiz.title}` : "That's the quiz"}
        </p>
        <Eyebrow>{quiz.round && quiz.round.count > 1 ? `Round ${quiz.round.index + 1} of ${quiz.round.count}` : quiz.title}</Eyebrow>
      </div>
      <div className="grid min-h-0 items-start" style={{ gridTemplateColumns: side ? "1.25fr 1fr" : "1fr", gap: u(4) }}>
        <div className="grid min-w-0" style={{ gap: u(2.2) }}>
          {podium ? <Podium rows={rows} /> : null}
          {podium && rows.length > 3 ? (
            <Board rows={rows.slice(3)} size={Math.min(5, Math.max(0, look.boardSize - 3))} animate={false} teams={quiz.teams} title="And the rest" />
          ) : !podium ? (
            <Board rows={rows} size={look.boardSize} animate={look.animate} teams={quiz.teams} />
          ) : null}
        </div>
        {side ? (
          <div className="grid min-w-0" style={{ gap: u(3) }}>
            {teams ? <TeamBoard teams={teams} /> : null}
            {overall ? <Board rows={overall} size={5} animate={false} title="Across the rounds" rounds /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function QuizStage({
  quiz,
  look,
  control,
  join,
  joinBig,
}: {
  quiz: HostState;
  look: StageLook;
  control: ScreenControl | null;
  /** The join panel, drawn large in the lobby when the theme asks for it there. */
  join: React.ReactNode;
  joinBig: boolean;
}) {
  const phase = phaseOf(quiz);
  if (phase === "ended") return <Finished quiz={quiz} look={look} />;
  if (quiz.question) return <Question quiz={quiz} look={look} control={control} />;
  if (phase === "lobby") return <Lobby quiz={quiz} joinBig={joinBig} join={join} />;
  return null;
}
