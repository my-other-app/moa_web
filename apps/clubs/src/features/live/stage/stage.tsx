"use client";

import * as React from "react";
import { cn } from "@moa/ui";

import { roomAddress, roomUrl, type RoomEvent } from "../room";
import { phaseOf, type Screen, type Theme } from "../schemas";
import { backgroundStyle, nativeVars, themeVars, useThemeFonts } from "../theme";
import { Board, Eyebrow, FIT_LAST, FIT_TEXT, FitContext, Podium, overflows, t, u, type Fit } from "./parts";
import { PollStage } from "./poll";
import { QuizStage, type StageLook } from "./quiz";
import { IdleSlides, QAWall, SponsorStrip, StageJoin, Updates } from "./room";

/**
 * The big screen as the theme and the screen's controls draw it: one stage
 * for the projector pages (/screen and /present) and for the editor's
 * preview, so what the organiser sees while choosing is what the hall sees.
 *
 * What it shows is the server's `shows` (CONTRACT 8.2), so every screen in
 * the hall agrees; a server from before the controls sends none, and the
 * same rule is applied here to today's fields.
 *
 * Everything is sized in stage units (a hundredth of a 16:9 box fitted in
 * the stage), so a preview a few hundred pixels wide and a 4K projector
 * draw the same picture.
 *
 * And everything fits: between the header and the sponsors and updates at
 * the foot, the stage measures what it shows and packs it tighter, step by
 * step (parts.tsx FIT_TEXT), until nothing is cut off.
 */

export type Shows = NonNullable<Screen["shows"]>;

export function showsOf(s: Screen): Shows {
  if (s.shows) return s.shows;
  if (s.quiz?.status === "live") return "quiz";
  if (s.poll?.status === "live") return "poll";
  if (s.pinned) return "qa";
  if (s.control?.idle_slides.length) return "idle";
  return "qa";
}

/** How the stage looks: the theme's choices, or (never customised) the screen's own. */
export function lookOf(theme: Theme | null, variant: "screen" | "present"): StageLook {
  if (!theme)
    return { theme: null, tiles: "native", layout: "grid", timer: "number", boardSize: variant === "present" ? 10 : 8, podium: false, animate: true };
  return {
    theme,
    tiles: theme.answers.style,
    layout: theme.screen.answer_layout,
    timer: theme.timer,
    boardSize: theme.leaderboard.size,
    podium: theme.leaderboard.podium,
    animate: theme.leaderboard.animate,
  };
}

/**
 * What the stage shows, by its shape: a new view, round, phase, question or
 * poll, other strips at the foot or another look. When it changes, the
 * stage is fitted again from the start; while it stays (scores ticking,
 * answers landing, the clock), the fit only ever steps on.
 */
export function shapeOf(s: Screen, shows: Shows, theme: Theme | null): string {
  const q = s.quiz;
  const look = theme
    ? [theme.screen.text_scale, theme.screen.join, theme.screen.answer_layout, theme.screen.sponsors, theme.leaderboard.size, theme.leaderboard.podium, theme.timer, theme.answers.style, theme.font.display, theme.font.body].join(",")
    : "own";
  return [
    shows,
    look,
    q ? [q.status, q.round?.index ?? 0, phaseOf(q), q.question?.id ?? "", q.question?.kind ?? "", q.board_now ? 1 : 0, Math.min(q.leaderboard.length, 13), q.teams?.length ?? 0, q.overall?.length ?? 0].join(":") : "",
    s.poll ? `${s.poll.id}:${s.poll.status}` : "",
    shows === "qa" ? `${s.pinned?.id ?? ""}:${(s.wall ?? s.board).length}` : "",
    shows === "leaderboard" ? `${s.overall?.length ?? 0}` : "",
    shows === "idle" ? `${(s.control?.idle_slides ?? []).join(",")}:${(s.agenda ?? []).length}` : "",
    (s.sponsors ?? []).length,
    (s.updates ?? []).length || (s.update ? 1 : 0),
  ].join("|");
}

/**
 * The fit: after every change the content area (`ref`) is measured, and
 * while what is inside reaches past it the next step is taken, before the
 * screen is painted. It starts again from 0 when the shape changes, the
 * area is resized (another window, the strips at the foot) or the theme's
 * fonts arrive; `refit` asks for that, `recheck` for one more measure.
 */
function useStageFit(shape: string, content: unknown) {
  const ref = React.useRef<HTMLElement | null>(null);
  const [box, setBox] = React.useState("");
  const [fresh, setFresh] = React.useState(0);
  const [tick, setTick] = React.useState(0);
  const sig = `${shape}|${box}|${fresh}`;
  const [fit, setFit] = React.useState({ sig, level: 0 });
  const level = fit.sig === sig ? fit.level : 0;
  if (fit.sig !== sig) setFit({ sig, level: 0 });
  const current = fit.sig === sig;
  /** The area's size when it was last measured, so a resize is told from the observer's first call. */
  const measured = React.useRef("");
  // Measured after every step, every new read of the screen (`content`) and every recheck.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !current) return;
    measured.current = `${el.clientWidth}x${el.clientHeight}`;
    if (level < FIT_LAST && overflows(el)) setFit({ sig, level: level + 1 });
  }, [current, sig, level, tick, content]);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const now = `${el.clientWidth}x${el.clientHeight}`;
      if (now !== measured.current) setBox(now);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const refit = React.useCallback(() => setFresh((n) => n + 1), []);
  const recheck = React.useCallback(() => setTick((n) => n + 1), []);
  React.useEffect(() => {
    const fonts = typeof document === "undefined" ? undefined : document.fonts;
    if (!fonts?.addEventListener) return;
    fonts.addEventListener("loadingdone", refit);
    return () => fonts.removeEventListener("loadingdone", refit);
  }, [refit]);
  const value = React.useMemo<Fit>(() => ({ level, refit, recheck }), [level, refit, recheck]);
  return { ref, level, value };
}

/** The full-screen join panel's QR, in stage units, at each step of the fit. */
const BIG_QR = [24, 20, 17, 15] as const;

function Header({ name, theme }: { name: string; theme: Theme | null }) {
  const logo = theme && theme.screen.logo ? (theme.logo?.large ?? theme.logo?.medium ?? theme.logo?.original ?? null) : null;
  return (
    <header className="flex items-center justify-between" style={{ gap: u(3) }}>
      <div className="flex min-w-0 items-center" style={{ gap: u(1.6) }}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="shrink-0 object-contain" style={{ height: u(5), maxWidth: u(14) }} />
        ) : null}
        <h1 className="min-w-0 truncate font-semibold tracking-[-0.02em]" style={{ fontSize: t(2.2), fontFamily: "var(--lt-font-display)" }}>
          {name}
        </h1>
      </div>
      <p className="flex shrink-0 items-center" style={{ gap: u(0.8) }}>
        <span className="inline-block rounded-full" style={{ width: u(0.9), height: u(0.9), background: "var(--lt-accent)" }} aria-hidden="true" />
        <span className="font-mono tracking-[0.18em] uppercase" style={{ fontSize: t(1.1), color: "var(--lt-muted)" }}>
          Live
        </span>
      </p>
    </header>
  );
}

function Nothing({ variant, join }: { variant: "screen" | "present"; join: React.ReactNode }) {
  if (variant === "present")
    return (
      <div className="grid h-full items-center" style={{ gridTemplateColumns: "minmax(0, auto) minmax(0, 1fr)", gap: u(5) }}>
        {join}
        <div>
          <p className="leading-[1.15] font-semibold tracking-[-0.02em]" style={{ fontSize: t(4.4), fontFamily: "var(--lt-font-display)" }}>
            Join the room from your phone
          </p>
          <p className="leading-[1.4]" style={{ marginTop: u(2), fontSize: t(2.2), color: "var(--lt-muted)" }}>
            Point your camera at the code — no app to install. Ask questions, vote in polls and play along from there.
          </p>
        </div>
      </div>
    );
  return (
    <p className="self-center text-center" style={{ fontSize: t(2.4), color: "var(--lt-muted)" }}>
      Nothing on the screen yet. Pin a question, launch a poll or host the quiz from the console.
    </p>
  );
}

export function Stage({
  screen: s,
  event,
  variant,
  className,
}: {
  screen: Screen;
  event: RoomEvent;
  variant: "screen" | "present";
  className?: string;
}) {
  const theme = s.theme_custom && s.theme ? s.theme : null;
  useThemeFonts(theme);
  const look = lookOf(theme, variant);
  const control = s.control ?? null;
  const shows = showsOf(s);
  const quiz = s.quiz ?? null;
  const { ref, level, value: fit } = useStageFit(shapeOf(s, shows, theme), s);
  const url = roomUrl(event);
  const address = roomAddress(event);
  const code = quiz?.status === "live" ? quiz.join_code : null;
  // Where the way in is: the theme says (corner, the lobby only, never); the
  // screen's own look keeps today's (the present view always has it, the host screen never).
  const joinMode = theme ? theme.screen.join : variant === "present" ? "corner" : "hidden";
  const lobby = shows === "quiz" && quiz && phaseOf(quiz) === "lobby";
  const joinBig = Boolean(lobby && joinMode === "lobby");
  // In the lobby the code stands large beside the QR, so the panel leaves it out.
  const big = <StageJoin url={url} address={address} code={lobby ? null : code} size={BIG_QR[Math.min(level, BIG_QR.length - 1)] ?? 15} />;
  const idleJoin = shows === "idle" && (control?.idle_slides ?? []).includes("join");

  let main: React.ReactNode = null;
  let empty = false;
  if (shows === "quiz" && quiz) main = <QuizStage quiz={quiz} look={look} control={control} join={big} joinBig={joinBig} />;
  else if (shows === "poll" && s.poll) main = <PollStage poll={s.poll} timer={look.timer} />;
  else if (shows === "idle")
    main = <IdleSlides slides={control?.idle_slides ?? []} seconds={control?.slide_seconds ?? 12} agenda={s.agenda ?? []} sponsors={s.sponsors ?? []} join={big} />;
  else if (shows === "leaderboard") {
    const rows = s.overall && s.overall.length ? s.overall : (quiz?.leaderboard ?? []);
    // Short of room, the rows after the podium (or the board) get fewer.
    const size = level >= 2 ? Math.min(look.boardSize, look.podium ? 4 : 6) : look.boardSize;
    main = (
      <div className="grid h-full content-start" style={{ gap: u(level >= 1 ? 1.6 : 2.5) }}>
        <div className="text-center">
          <Eyebrow>{s.overall && s.overall.length ? "Across the rounds" : (quiz?.title ?? "Leaderboard")}</Eyebrow>
        </div>
        {look.podium && rows.length ? <Podium rows={rows} /> : null}
        <Board rows={look.podium ? rows.slice(3) : rows} size={size} animate={look.animate} rounds={Boolean(s.overall?.length)} title={look.podium ? "And the rest" : "Leaderboard"} />
      </div>
    );
  } else if (shows === "qa" && (s.pinned || (s.wall ?? s.board).length)) main = <QAWall pinned={s.pinned} wall={s.wall?.length ? s.wall : s.board} />;
  if (!main) {
    empty = true;
    main = <Nothing variant={variant} join={big} />;
  }
  // The board beside a revealed question, and the final board, need the room: answers are closed then, and the corner comes back with the next question.
  const boardUp =
    shows === "quiz" && quiz !== null && ((phaseOf(quiz) === "revealed" && Boolean(quiz.board_now) && quiz.leaderboard.length > 0) || phaseOf(quiz) === "ended");
  const corner = joinMode === "corner" && !joinBig && !idleJoin && !boardUp && !(empty && variant === "present");
  const sponsors = theme?.screen.sponsors ? (s.sponsors ?? []) : [];
  const image = theme?.background.kind === "image" && theme.background.image ? theme : null;
  const text = FIT_TEXT[level] ?? 1;

  return (
    <div
      className={cn("relative h-full w-full overflow-hidden", className)}
      style={{ containerType: "size", ...(theme ? themeVars(theme, "screen") : nativeVars()) }}
      data-shows={shows}
      data-theme={theme ? theme.preset : "own"}
    >
      <div aria-hidden="true" className="absolute inset-0" style={backgroundStyle(theme, "screen")} />
      {image ? <div aria-hidden="true" className="absolute inset-0" style={{ background: image.colors.background, opacity: image.background.dim }} /> : null}
      <div
        className="relative grid h-full grid-rows-[auto_1fr_auto]"
        style={
          {
            "--u": "min(1cqw, 1.7778cqh)",
            // The fit's last steps make the type smaller, the header's and the foot's with it: they share the box.
            "--t": text < 1 ? `calc(var(--u) * var(--lt-scale) * ${text})` : "calc(var(--u) * var(--lt-scale))",
            color: "var(--lt-on-bg)",
            fontFamily: "var(--lt-font-body)",
            padding: `${u(2.6)} ${u(3.6)}`,
            gap: u(2.2),
          } as React.CSSProperties
        }
      >
        <Header name={s.event.name} theme={theme} />
        <FitContext.Provider value={fit}>
          <section
            ref={ref}
            data-fit={level}
            className="relative grid min-h-0 overflow-hidden"
            style={corner ? { gridTemplateColumns: "minmax(0, 1fr) auto", gap: u(3) } : undefined}
          >
            <div className="relative min-h-0 min-w-0">{main}</div>
            {corner ? (
              <aside className="flex flex-col justify-end">
                <StageJoin url={url} address={address} code={code} size={11} label={quiz?.question ? "Late? Scan to join" : "Scan to join"} />
              </aside>
            ) : null}
          </section>
        </FitContext.Provider>
        <footer className="grid" style={{ gap: u(1.2), minHeight: u(4) }}>
          {sponsors.length ? <SponsorStrip sponsors={sponsors} /> : null}
          <Updates ticker={Boolean(control?.ticker)} updates={s.updates ?? []} latest={s.update} />
        </footer>
      </div>
    </div>
  );
}
