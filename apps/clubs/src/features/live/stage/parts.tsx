"use client";

import * as React from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "@moa/ui";

import type { BoardRow, OverallRow, QuizOption, TallyRow, TeamRow, Theme } from "../schemas";
import { LETTER_MARKS, SHAPES, SHAPE_NAMES, usePrefersReducedMotion } from "../theme";

/**
 * The pieces every big-screen layout is built from. Sizes are in stage
 * units (`--u`: a hundredth of a 16:9 box fitted in the stage, so the
 * preview in the editor and a 4K projector draw the same picture) and type
 * is in `--t` (the same, times the theme's text scale). Colours are the
 * theme's custom properties (theme.ts themeVars / nativeVars).
 */
export const u = (n: number) => `calc(var(--u) * ${n})`;
export const t = (n: number) => `calc(var(--t) * ${n})`;

// --- fitting the stage ----------------------------------------------------------------------

/**
 * How hard the stage is packing what it shows into its 16:9 box. The stage
 * (stage.tsx) measures its content area after every change and, while
 * anything would be cut off by the header, the sponsors or the updates,
 * takes the next step; a new question, phase, slide or window size starts
 * again from 0.
 *
 *   0   as designed
 *   1   compact: the teams one line each, the boards' rows closer, answers
 *       beside a board in two columns, a lower podium, a smaller join QR,
 *       the programme one line a slot
 *   2   fewer: three rows of the board beside a question, two of "and the
 *       rest", three across the rounds; smaller headings; the programme in
 *       two columns; four questions from the floor under the pinned one
 *   3   tighter answer tiles, the podium lower still, the QR smaller still
 *   4…  the type a step smaller each time (FIT_TEXT), the header's and the
 *       foot's with it, to half at the last (a 160% theme at 80%)
 *
 * Answers are never dropped or cut: only the boards beside them get shorter.
 */
export const FIT_TEXT = [1, 1, 1, 1, 0.92, 0.85, 0.78, 0.72, 0.66, 0.6, 0.55, 0.5] as const;
export const FIT_LAST = FIT_TEXT.length - 1;

export interface Fit {
  /** The step the stage is on (0: as designed). */
  level: number;
  /** What is shown has changed shape (a new slide): fit it again from the start. */
  refit: () => void;
  /** Something inside changed its own layout (answers moved to a column): measure again, from the step it is on. */
  recheck: () => void;
}
const noop = () => {};
export const FitContext = React.createContext<Fit>({ level: 0, refit: noop, recheck: noop });
export const useFit = () => React.useContext(FitContext);

/** True when what is inside `el` reaches past its box: cut off at the foot, or off the side. */
export function overflows(el: HTMLElement): boolean {
  return el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
}

// --- the clock ----------------------------------------------------------------------

/**
 * The wall clock, read again every `ms`: what the countdowns below tick
 * from. It runs for as long as the component is on screen, so it is never
 * more than one tick out of date when a clock starts.
 */
export function useNow(ms = 200): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** Whole seconds until `at` (an ISO time), ticking; null without one. */
export function useSecondsUntil(at: string | null | undefined, round: "up" | "nearest" = "up"): number | null {
  const now = useNow(500);
  if (!at) return null;
  const left = (new Date(at).getTime() - now) / 1000;
  return Math.max(0, round === "up" ? Math.ceil(left) : Math.round(left));
}

/**
 * Seconds left on a question, ticking between two reads of the screen. The
 * server says the whole seconds left each time it is read (every second and
 * a half); in between, the clock runs down here, and the next read sets it
 * right again. Stopped while paused, and never below 0.
 */
export function useCountdown(timeLeft: number, running: boolean): number {
  const now = useNow(200);
  // When the server's figure last changed: kept from the render that saw it change.
  const [anchor, setAnchor] = React.useState({ base: timeLeft, at: now });
  if (anchor.base !== timeLeft) {
    setAnchor({ base: timeLeft, at: now });
    return timeLeft;
  }
  if (!running || timeLeft <= 0) return timeLeft;
  return Math.max(0, timeLeft - (now - anchor.at) / 1000);
}

export function Timer({
  style,
  left,
  seconds,
  paused,
  className,
}: {
  style: Theme["timer"];
  left: number;
  seconds: number;
  paused?: boolean;
  className?: string;
}) {
  if (style === "hidden") return null;
  const whole = Math.ceil(left);
  const share = seconds > 0 ? Math.max(0, Math.min(1, left / seconds)) : 0;
  const label = paused ? `Paused at ${whole} seconds` : whole === 0 ? "Time is up" : `${whole} seconds left`;
  if (style === "number")
    return (
      <span
        role="timer"
        aria-label={label}
        className={cn("font-mono leading-none font-semibold tabular-nums", className)}
        style={{ fontSize: t(5.2), color: paused ? "var(--lt-muted)" : "var(--lt-accent)" }}
      >
        {whole === 0 ? "Time" : `${whole}s`}
      </span>
    );
  if (style === "ring") {
    const r = 44;
    const c = 2 * Math.PI * r;
    return (
      <span role="timer" aria-label={label} className={cn("relative inline-grid place-items-center", className)} style={{ width: u(6.5), height: u(6.5) }}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--lt-panel-line)" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={paused ? "var(--lt-muted)" : "var(--lt-accent)"}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - share)}
            style={{ transition: "stroke-dashoffset 0.2s linear" }}
          />
        </svg>
        <span className="font-mono font-semibold tabular-nums" style={{ fontSize: t(2.6) }}>
          {whole}
        </span>
      </span>
    );
  }
  // The bar: a strip that empties as the question runs.
  return (
    <span role="timer" aria-label={label} className={cn("block w-full overflow-hidden rounded-full", className)} style={{ height: u(1), background: "var(--lt-panel-line)" }}>
      <span
        className="block h-full rounded-full"
        style={{ width: `${share * 100}%`, background: paused ? "var(--lt-muted)" : "var(--lt-accent)", transition: "width 0.2s linear" }}
      />
    </span>
  );
}

// --- the answers ----------------------------------------------------------------------

/** How the answer tiles look: the theme's style, or `native` (today's screen: quiet tiles with the brand's marks). */
export type TileStyle = Theme["answers"]["style"] | "native";

/** The mark beside an answer: its shape, its letter, or nothing. */
export function Mark({ index, style }: { index: number; style: TileStyle }) {
  if (style === "plain") return null;
  const mark = style === "letters" ? LETTER_MARKS[index] : SHAPES[index];
  return (
    <span aria-hidden="true" className="shrink-0 font-mono" style={{ fontSize: "0.8em", opacity: style === "native" ? 1 : 0.9, color: style === "native" ? "var(--lt-accent)" : undefined }}>
      {mark}
    </span>
  );
}

/** The accessible name of an answer's mark, so a screen reader hears what a colour-blind player sees. */
export const markName = (index: number, style: TileStyle) =>
  style === "plain" ? "" : style === "letters" ? `${LETTER_MARKS[index]}: ` : `${SHAPE_NAMES[index]}: `;

/**
 * Answers keep their words whole. Each label is laid out without breaking
 * inside a word and measured: when a word is wider than its tile, the tiles
 * go to one column (each as wide as the row), and only a word wider than
 * the whole row is broken. Measured again when the labels or the width change.
 */
function useWholeWords(labels: string, canColumn: boolean) {
  const ref = React.useRef<HTMLUListElement>(null);
  // The stage's step changes the type's size: the words are measured again then too.
  const { level, recheck } = useFit();
  const [width, setWidth] = React.useState(0);
  const sig = `${labels}|${canColumn}|${width}`;
  const [state, setState] = React.useState<{ sig: string; wrap: 0 | 1 | 2 }>({ sig, wrap: 0 });
  // 0: as laid out · 1: one column · 2: words may break (one too long for a row).
  const wrap = state.sig === sig ? state.wrap : 0;
  if (state.sig !== sig) setState({ sig, wrap: 0 });
  const current = state.sig === sig;
  React.useLayoutEffect(() => {
    const ul = ref.current;
    if (!ul || !current || wrap === 2) return;
    const cut = Array.from(ul.querySelectorAll<HTMLElement>("[data-label]")).some((el) => el.scrollWidth > el.clientWidth + 1);
    if (!cut) return;
    setState({ sig, wrap: wrap === 0 && canColumn ? 1 : 2 });
    // One column is taller: the stage measures again.
    recheck();
  }, [current, sig, wrap, canColumn, recheck, level]);
  React.useEffect(() => {
    const ul = ref.current;
    if (!ul || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth(Math.round(ul.clientWidth)));
    ro.observe(ul);
    return () => ro.disconnect();
  }, []);
  return { ref, wrap };
}

export function AnswerTiles({
  options,
  counts,
  style,
  layout,
  showCounts,
  revealed,
  correct,
  answered,
  order,
  tight,
}: {
  options: QuizOption[];
  counts: TallyRow[];
  style: TileStyle;
  layout: "grid" | "column";
  /** The tally is on the screen (live results, or after the reveal). */
  showCounts: boolean;
  /** The answer is out: the right tiles are marked and the others step back. */
  revealed: boolean;
  /** The keys that are right (none for a poll question). */
  correct: Set<string>;
  answered: number;
  /** Put in order: numbered; one per row, or two columns read down (layout "grid"). */
  order?: boolean;
  /** Less padding round each answer (a phone's width; the stage packs them this way from fit step 3). */
  tight?: boolean;
}) {
  const byKey = new Map(counts.map((c) => [c.key, c]));
  const { level } = useFit();
  const close = tight || level >= 3;
  const { ref, wrap } = useWholeWords(options.map((o) => o.label).join("\u0000"), layout === "grid");
  const columns = layout === "grid" && wrap === 0 ? 2 : 1;
  // An order in two columns reads down the first, then the second.
  const down = order && columns === 2 ? { gridAutoFlow: "column" as const, gridTemplateRows: `repeat(${Math.ceil(options.length / 2)}, auto)` } : undefined;
  return (
    <ul ref={ref} className={cn("grid", columns === 2 ? "grid-cols-2" : "grid-cols-1")} style={{ gap: u(close ? 0.9 : 1.2), ...down }}>
      {options.map((o, i) => {
        const count = byKey.get(o.key)?.count ?? 0;
        const right = revealed && correct.has(o.key);
        const out = revealed && correct.size > 0 && !right;
        const coloured = style === "shapes" || style === "letters";
        return (
          <li
            key={o.key}
            data-correct={right || undefined}
            className="relative flex items-center overflow-hidden rounded-[1.2em] transition-opacity"
            style={{
              gap: u(close ? 1.1 : 1.6),
              padding: close ? `${u(0.85)} ${u(1.4)}` : `${u(1.3)} ${u(2)}`,
              fontSize: t(2.15),
              background: coloured ? `var(--lt-a${i})` : "var(--lt-panel)",
              color: coloured ? `var(--lt-on-a${i})` : "var(--lt-on-bg)",
              opacity: out ? 0.42 : 1,
              boxShadow: right ? `0 0 0 ${u(0.45)} var(--lt-accent)` : style === "plain" ? "inset 0 0 0 1px var(--lt-panel-line)" : undefined,
            }}
          >
            {showCounts && answered > 0 ? (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0"
                style={{ width: `${Math.round((count / Math.max(1, answered)) * 100)}%`, background: "currentColor", opacity: 0.12, transition: "width 0.4s ease" }}
              />
            ) : null}
            {order ? (
              <span aria-hidden="true" className="relative shrink-0 font-mono font-semibold tabular-nums" style={{ opacity: 0.8 }}>
                {i + 1}
              </span>
            ) : (
              <span className="relative">
                <Mark index={i} style={style} />
              </span>
            )}
            <span data-label className={cn("relative min-w-0 flex-1 leading-[1.2]", wrap === 2 ? "[overflow-wrap:anywhere]" : "[overflow-wrap:normal]")}>
              <span className="sr-only">{order ? `${i + 1}. ` : markName(i, style)}</span>
              {o.label}
            </span>
            {right ? <CheckIcon aria-label="Right answer" className="relative shrink-0" style={{ width: "1.1em", height: "1.1em" }} /> : null}
            {showCounts ? (
              <span className="relative shrink-0 font-mono tabular-nums" style={{ opacity: 0.85 }}>
                {count}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

// --- the boards ----------------------------------------------------------------------

/**
 * Rows that slide to their new places when the order changes (the theme's
 * `animate`, and never when the reader asked for less motion). A FLIP: each
 * row is measured before and after, and moved from where it was. A step of
 * the stage's fit (`epoch`) moves rows too, but nobody's place: the rows
 * are measured again where they now are, and nothing slides.
 */
function useSlide<T extends HTMLElement>(keys: string[], on: boolean, epoch = 0) {
  const refs = React.useRef(new Map<string, T>());
  const last = React.useRef(new Map<string, number>());
  const lastEpoch = React.useRef(epoch);
  const joined = keys.join("|");
  React.useLayoutEffect(() => {
    const now = new Map<string, number>();
    refs.current.forEach((el, k) => now.set(k, el.getBoundingClientRect().top));
    const refitted = lastEpoch.current !== epoch;
    lastEpoch.current = epoch;
    if (on && !refitted) {
      now.forEach((top, k) => {
        const before = last.current.get(k);
        const el = refs.current.get(k);
        if (before === undefined || !el || before === top) return;
        el.animate?.([{ transform: `translateY(${before - top}px)` }, { transform: "translateY(0)" }], { duration: 450, easing: "cubic-bezier(.2,.7,.2,1)" });
      });
    }
    last.current = now;
  }, [joined, on, epoch]);
  return (key: string) => (el: T | null) => {
    if (el) refs.current.set(key, el);
    else refs.current.delete(key);
  };
}

const rowKey = (r: { rank: number; name: string }, i: number) => `${r.name}·${i}·${r.rank}`;

export function Board({
  rows,
  size,
  animate,
  teams,
  title = "Leaderboard",
  rounds,
}: {
  rows: (BoardRow | OverallRow)[];
  size: number;
  animate: boolean;
  teams?: TeamRow[] | null;
  title?: string;
  /** The board across rounds: how many rounds each played. */
  rounds?: boolean;
}) {
  const reduce = usePrefersReducedMotion();
  const { level } = useFit();
  // From the fit's first step the rows sit closer.
  const close = level >= 1;
  const shown = rows.slice(0, size);
  // Ties share a rank (board.py), so a row is its name and place together, never the rank alone.
  const keys = shown.map((r) => r.name);
  const ref = useSlide<HTMLLIElement>(keys, animate && !reduce, level);
  const colour = new Map((teams ?? []).map((tm) => [tm.key, tm]));
  return (
    <section aria-label={title}>
      <p className="font-mono tracking-[0.14em] uppercase" style={{ fontSize: t(1.2), color: "var(--lt-muted)" }}>
        {title}
      </p>
      {shown.length === 0 ? (
        <p style={{ marginTop: u(1.2), fontSize: t(1.8), color: "var(--lt-muted)" }}>Scores appear after the first question.</p>
      ) : (
        <ol className="grid" style={{ marginTop: u(close ? 0.8 : 1.2), gap: u(close ? 0.4 : 0.7) }}>
          {shown.map((r, i) => {
            const team = "team" in r && r.team ? colour.get(r.team) : undefined;
            return (
              <li
                key={rowKey(r, i)}
                ref={ref(r.name)}
                className="flex items-baseline rounded-[0.6em]"
                style={{ gap: u(1.6), fontSize: t(close ? 1.95 : 2.1), padding: close ? `${u(0.35)} ${u(1.1)}` : `${u(0.55)} ${u(1.2)}`, background: i === 0 ? "var(--lt-panel)" : undefined }}
              >
                <span className="w-[2.2em] shrink-0 font-mono tabular-nums" style={{ fontSize: "0.78em", color: "var(--lt-muted)" }}>
                  {r.rank}
                </span>
                {team ? <span aria-label={team.name} className="inline-block shrink-0 rounded-full" style={{ width: "0.55em", height: "0.55em", background: team.color }} /> : null}
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                {rounds && "rounds" in r && r.rounds ? (
                  <span className="shrink-0 font-mono tabular-nums" style={{ fontSize: "0.7em", color: "var(--lt-muted)" }}>
                    {r.rounds} {r.rounds === 1 ? "round" : "rounds"}
                  </span>
                ) : null}
                <span className="shrink-0 font-mono tabular-nums">{r.score}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** How tall the podium's steps stand at each step of the fit: lower as the stage packs tighter. */
const PODIUM_SCALE = [1, 0.72, 0.6, 0.5];

/** The final board's top three, 2 · 1 · 3, on steps of the accent. */
export function Podium({ rows }: { rows: (BoardRow | OverallRow)[] }) {
  const { level } = useFit();
  const k = PODIUM_SCALE[Math.min(level, PODIUM_SCALE.length - 1)]!;
  const top = rows.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean) as (BoardRow | OverallRow)[];
  const height = (r: BoardRow | OverallRow) => (r === top[0] ? 13 : r === top[1] ? 9.5 : 7) * k;
  return (
    <section aria-label="Podium" className="flex items-end justify-center" style={{ gap: u(1.6) }}>
      {order.map((r) => (
        <div key={`${r.rank}-${r.name}`} className="flex flex-col items-center" style={{ width: u(level >= 2 ? 13 : 15) }}>
          <p className="w-full truncate text-center font-semibold" style={{ fontSize: t(2.1), fontFamily: "var(--lt-font-display)" }}>
            {r.name}
          </p>
          <p className="font-mono tabular-nums" style={{ fontSize: t(1.5), color: "var(--lt-muted)" }}>
            {r.score}
          </p>
          <div
            className="grid w-full place-items-start justify-center rounded-t-[0.5em]"
            style={{ marginTop: u(0.8), height: u(height(r)), background: "var(--lt-accent)", color: "var(--lt-on-accent)", paddingTop: u(k < 1 ? 0.6 : 1) }}
          >
            <span className="font-mono leading-none font-semibold" style={{ fontSize: t(k < 1 ? 2.4 : 3) }} aria-label={`Place ${r.rank}`}>
              {r.rank}
            </span>
          </div>
        </div>
      ))}
    </section>
  );
}

/**
 * The teams' board: each team's score as a bar in its own colour. From the
 * fit's first step, one line a team (place, name, bar, score), half the height.
 */
export function TeamBoard({ teams }: { teams: TeamRow[] }) {
  const { level } = useFit();
  const max = Math.max(1, ...teams.map((tm) => tm.score));
  const bar = (tm: TeamRow) => (
    <span className="block h-full rounded-full" style={{ width: `${Math.round((tm.score / max) * 100)}%`, background: tm.color, transition: "width 0.5s ease" }} />
  );
  if (level >= 1)
    return (
      <section aria-label="Teams">
        <p className="font-mono tracking-[0.14em] uppercase" style={{ fontSize: t(1.2), color: "var(--lt-muted)" }}>
          Teams
        </p>
        <ol className="grid" style={{ marginTop: u(0.8), gap: u(0.5) }}>
          {teams.map((tm) => (
            <li key={tm.key} className="grid items-center" style={{ gridTemplateColumns: "auto minmax(0, max-content) minmax(3em, 1fr) auto", gap: u(1.2), fontSize: t(1.75) }}>
              <span className="font-mono tabular-nums" style={{ color: "var(--lt-muted)", fontSize: "0.8em" }}>
                {tm.rank ?? ""}
              </span>
              <span className="truncate">{tm.name}</span>
              <span className="block overflow-hidden rounded-full" style={{ height: u(0.8), background: "var(--lt-panel-line)" }} aria-hidden="true">
                {bar(tm)}
              </span>
              <span className="text-right font-mono tabular-nums">{tm.score}</span>
            </li>
          ))}
        </ol>
      </section>
    );
  return (
    <section aria-label="Teams">
      <p className="font-mono tracking-[0.14em] uppercase" style={{ fontSize: t(1.2), color: "var(--lt-muted)" }}>
        Teams
      </p>
      <ol className="grid" style={{ marginTop: u(1.2), gap: u(0.9) }}>
        {teams.map((tm) => (
          <li key={tm.key} style={{ fontSize: t(1.9) }}>
            <div className="flex items-baseline justify-between" style={{ gap: u(1) }}>
              <span className="min-w-0 truncate">
                <span className="font-mono tabular-nums" style={{ color: "var(--lt-muted)", fontSize: "0.8em", marginRight: "0.6em" }}>
                  {tm.rank ?? ""}
                </span>
                {tm.name}
              </span>
              <span className="shrink-0 font-mono tabular-nums">{tm.score}</span>
            </div>
            <span className="mt-[0.3em] block overflow-hidden rounded-full" style={{ height: u(0.9), background: "var(--lt-panel-line)" }}>
              {bar(tm)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A panel on the stage: the theme's quiet fill behind a block. */
export function Panel({ className, style, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("min-w-0 rounded-[1.4em]", className)} style={{ background: "var(--lt-panel)", padding: u(2.6), fontSize: t(1), ...style }} {...props}>
      {children}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("font-mono tracking-[0.14em] uppercase", className)} style={{ fontSize: t(1.3), color: "var(--lt-muted)" }}>
      {children}
    </p>
  );
}
