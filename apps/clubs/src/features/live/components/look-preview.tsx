"use client";

import * as React from "react";
import { Segmented, cn } from "@moa/ui";

import type { RoomEvent } from "../room";
import type { HostState, Screen, ScreenControl, Theme } from "../schemas";
import { AnswerTiles, Timer } from "../stage/parts";
import { Stage } from "../stage/stage";
import { LIGHT_BG, backgroundStyle, themeVars, useThemeFonts } from "../theme";

/**
 * The look, drawn before it is saved: the big screen (the real stage, fed
 * made-up content) beside a phone. Both redraw on every change in the
 * editor, so the organiser sees the hall and a guest's hand together.
 */

export const PREVIEW_STATES = [
  { value: "lobby", label: "Lobby" },
  { value: "question", label: "Question" },
  { value: "answer", label: "Answer" },
  { value: "podium", label: "Final board" },
  { value: "poll", label: "Poll" },
] as const;
export type PreviewState = (typeof PREVIEW_STATES)[number]["value"];

const OPTIONS = [
  { key: "a", label: "Saturn" },
  { key: "b", label: "Jupiter" },
  { key: "c", label: "Uranus" },
  { key: "d", label: "Neptune" },
];
const BOARD = [
  { rank: 1, name: "Kavya R.", score: 4820 },
  { rank: 2, name: "Arjun M.", score: 4610 },
  { rank: 3, name: "Nila S.", score: 4455 },
  { rank: 4, name: "Rahul P.", score: 4120 },
  { rank: 5, name: "Diya K.", score: 3980 },
  { rank: 6, name: "Farhan A.", score: 3870 },
  { rank: 7, name: "Ishita B.", score: 3705 },
  { rank: 8, name: "Joseph T.", score: 3540 },
  { rank: 9, name: "Meghna V.", score: 3310 },
  { rank: 10, name: "Varun N.", score: 3104 },
];

function sampleQuiz(state: PreviewState): HostState {
  const base: HostState = {
    status: "live",
    join_code: "482913",
    title: "Space quiz",
    players: 86,
    current_index: 2,
    total: 8,
    question: null,
    leaderboard: [],
    phase: "lobby",
    round: { index: 0, count: 1 },
  };
  if (state === "lobby") return base;
  if (state === "podium") return { ...base, status: "ended", phase: "ended", leaderboard: BOARD, board_now: true };
  const answer = state === "answer";
  return {
    ...base,
    phase: answer ? "revealed" : "question",
    board_now: answer,
    leaderboard: answer ? BOARD : [],
    question: {
      id: "sample",
      prompt: "Which planet has the most known moons?",
      options: OPTIONS,
      correct_key: answer ? "a" : null,
      seconds: 20,
      time_left: answer ? 0 : 12,
      answered: answer ? 81 : 54,
      counts: [
        { key: "a", label: "Saturn", count: answer ? 46 : 31, correct: answer },
        { key: "b", label: "Jupiter", count: answer ? 28 : 17, correct: false },
        { key: "c", label: "Uranus", count: answer ? 4 : 3, correct: false },
        { key: "d", label: "Neptune", count: answer ? 3 : 3, correct: false },
      ],
      kind: "single",
      effective_points: 1000,
      revealed: answer,
    },
  };
}

/** A screen payload with made-up content, in the look being edited. */
export function sampleScreen(theme: Theme, state: PreviewState, eventName: string, control?: ScreenControl | null): Screen {
  const poll = state === "poll";
  return {
    event: { id: 0, name: eventName },
    pinned: null,
    board: [],
    poll: poll
      ? {
          id: "sample",
          kind: "choice",
          prompt: "Pick tonight's pizza",
          options: ["Margherita", "Paneer tikka", "Veggie supreme", "Chicken BBQ"],
          status: "live",
          sort_order: 0,
          results: {
            responses: 64,
            choices: [
              { label: "Margherita", count: 21, pct: 33 },
              { label: "Paneer tikka", count: 25, pct: 39 },
              { label: "Veggie supreme", count: 11, pct: 17 },
              { label: "Chicken BBQ", count: 7, pct: 11 },
            ],
          },
          settings: { chart: "bar", show: "both" },
        }
      : null,
    quiz: poll ? null : sampleQuiz(state),
    update: { id: "u", kind: "general", text: "Pizza is in the foyer at 8:30", audience: "checked_in", recipients: 0, pushed: 0, sent_at: new Date(0).toISOString() },
    theme,
    theme_custom: true,
    control: control ?? null,
    shows: poll ? "poll" : "quiz",
    sponsors: [
      { name: "Orbit Labs", label: "Title sponsor", logo: null },
      { name: "Chai Point", label: "Refreshments", logo: null },
    ],
    updates: [],
  };
}

/** The phone: the guest's quiz in the look, as the website and the app will draw it. */
export function PhonePreview({ theme, eventName, state }: { theme: Theme; eventName: string; state: PreviewState }) {
  const g = theme.guest;
  const plain = g.background === "plain";
  const vars = themeVars(theme, "guest") as Record<string, string>;
  // On its own (plain) ground the phone keeps its page's ink; the theme brings the colours, fonts and answers.
  const ground: Record<string, string> = plain ? { "--lt-on-bg": "#111827", "--lt-muted": "#4B5563", "--lt-panel": "#FFFFFF", "--lt-panel-line": "#E0E3DE" } : {};
  const logo = g.logo ? (theme.logo?.medium ?? theme.logo?.thumbnail ?? null) : null;
  const image = !plain && theme.background.kind === "image" && theme.background.image;
  const answer = state === "answer" || state === "podium";
  return (
    <div className="border-ink/80 relative mx-auto w-[220px] shrink-0 2xl:w-[248px] overflow-hidden rounded-[34px] border-[7px] shadow-[0_18px_40px_-24px_rgba(0,0,0,0.55)]" aria-label="A guest's phone">
      <div
        className="relative flex aspect-[9/19] flex-col"
        style={{ ...vars, ...ground, ...(plain ? { background: LIGHT_BG } : backgroundStyle(theme, "guest")), "--u": "5.6px", "--t": `calc(5.6px * ${g.text_scale})`, color: "var(--lt-on-bg)", fontFamily: "var(--lt-font-body)" } as React.CSSProperties}
      >
        {image ? <div aria-hidden="true" className="absolute inset-0" style={{ background: theme.colors.background, opacity: theme.background.dim }} /> : null}
        <div className="relative flex flex-1 flex-col gap-2.5 px-3.5 pt-5 pb-4">
          <div className="flex items-center gap-2">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-6 w-auto max-w-[56px] shrink-0 object-contain" />
            ) : null}
            {/* Beside a logo the name has half the phone: two lines, broken between words, as the website's top of the room. */}
            <p className="line-clamp-2 min-w-0 leading-[1.15] font-semibold [overflow-wrap:break-word]" style={{ fontSize: `calc(${logo ? 10 : 11}px * ${g.text_scale})` }}>
              {eventName}
            </p>
          </div>
          {state === "poll" ? (
            <>
              <p className="font-semibold leading-tight" style={{ fontSize: `calc(17px * ${g.text_scale})`, fontFamily: "var(--lt-font-display)" }}>
                Pick tonight&apos;s pizza
              </p>
              <AnswerTiles
                options={["Margherita", "Paneer tikka", "Veggie supreme"].map((label, i) => ({ key: String(i), label }))}
                counts={[]}
                style={theme.answers.style}
                layout={g.answer_layout}
                showCounts={false}
                revealed={false}
                correct={new Set()}
                answered={0}
                tight
              />
            </>
          ) : state === "lobby" ? (
            <div className="grid flex-1 content-center justify-items-center gap-2 text-center">
              <p className="font-semibold" style={{ fontSize: `calc(16px * ${g.text_scale})`, fontFamily: "var(--lt-font-display)" }}>
                You&apos;re in, Kavya
              </p>
              <p style={{ fontSize: `calc(12px * ${g.text_scale})`, color: "var(--lt-muted)" }}>The first question is coming up.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--lt-muted)" }}>
                <span>Question 3 of 8</span>
                {theme.timer === "number" || theme.timer === "ring" ? <Timer style={theme.timer} left={answer ? 0 : 12} seconds={20} /> : null}
              </div>
              {theme.timer === "bar" && !answer ? <Timer style="bar" left={12} seconds={20} /> : null}
              <p className="font-semibold leading-tight" style={{ fontSize: `calc(16px * ${g.text_scale})`, fontFamily: "var(--lt-font-display)" }}>
                Which planet has the most known moons?
              </p>
              <AnswerTiles
                options={OPTIONS}
                counts={[]}
                style={theme.answers.style}
                layout={g.answer_layout}
                showCounts={false}
                revealed={answer}
                correct={new Set(["a"])}
                answered={0}
                tight
              />
              <p className="mt-auto text-center" style={{ fontSize: `calc(11px * ${g.text_scale})`, color: "var(--lt-muted)" }}>
                {answer ? `Right! +875 · ${theme.leaderboard.own_rank ? "you're 4th" : "nice"}` : "Tap your answer"}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function LookPreview({ theme, eventName, event, control }: { theme: Theme; eventName: string; event: RoomEvent; control?: ScreenControl | null }) {
  const [state, setState] = React.useState<PreviewState>("question");
  useThemeFonts(theme);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow">Preview, with made-up content</span>
        <Segmented label="What the preview shows" value={state} options={PREVIEW_STATES} onChange={setState} className="text-[11.5px]" />
      </div>
      <div className="grid items-start gap-4 2xl:grid-cols-[1fr_auto]">
        <div className={cn("border-line overflow-hidden rounded-xl border shadow-sm")} aria-label="The big screen">
          <div className="aspect-video w-full">
            <Stage screen={sampleScreen(theme, state, eventName, control)} event={event} variant="present" />
          </div>
        </div>
        <PhonePreview theme={theme} eventName={eventName} state={state} />
      </div>
    </div>
  );
}
