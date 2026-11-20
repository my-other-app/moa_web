"use client";

import * as React from "react";
import Link from "next/link";
import { CheckIcon, ExternalLinkIcon, PauseIcon, PlayIcon, RotateCcwIcon, SkipForwardIcon, TrophyIcon } from "lucide-react";
import { ExportMenu } from "@moa/app-kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  CardLabel,
  FigurePanel,
  NativeSelect,
  ProgressBar,
  Skeleton,
  StatusBadge,
  cn,
} from "@moa/ui";

import { useAccess } from "@/features/access";
import { useEventDetail } from "@/features/events/queries";
import { useFeatureGate } from "@/features/plan";

import { winnersExportUrl } from "../api";
import { useNotifyChoice } from "../notify";
import { isQuizRunning, useMarkWinners, useOverall, useRoundHost, useRoundMutations, useWinners } from "../queries";
import { roomAddress, roomUrl } from "../room";
import { phaseOf, type HostState, type MarkOut, type OverallRow, type TeamRow, type Winner } from "../schemas";
import { useSecondsUntil } from "../stage/parts";
import { SHAPES } from "../theme";
import { JoinQr } from "./join-qr";
import { NotifySwitch } from "./notify-switch";

/**
 * Running a round from the console: the lobby and its join code; each
 * question's clock and tally by its kind; the controls its phase allows
 * (pause, resume, skip, reveal, ask again, next); the board and the teams
 * beside it; and, once it has ended, its winners — exported, or marked on
 * their registrations so their certificates can follow.
 */

/**
 * An action the whole room feels, behind one confirm. Ending a round or
 * sending it back to editing cannot be undone in front of an audience —
 * every phone changes at once, and going back to editing clears every
 * score — so neither is a single press in a dark hall.
 */
export function useConfirmed({ title, body, confirm }: { title: string; body: string; confirm: string }, run: () => void) {
  const [asking, setAsking] = React.useState(false);
  const dialog = (
    <AlertDialog open={asking} onOpenChange={setAsking}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary">Keep going</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(e) => {
              e.preventDefault();
              run();
              setAsking(false);
            }}
          >
            {confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { ask: () => setAsking(true), dialog };
}

/**
 * Starting a round. The server refuses a start on a round that is running
 * (409 QUIZ_RUNNING: another console started it, or this one is behind),
 * because starting again clears every player's score: the host is asked
 * first, and only a yes sends `restart`. Another round live (QUIZ_OTHER_LIVE)
 * is said as the server says it: end that one first.
 */
export function useStart(eventId: number, quizId: string | null, notify: boolean) {
  const { host } = useRoundMutations(eventId, quizId);
  const [asking, setAsking] = React.useState(false);
  const start = () => host.mutate({ action: "start", notify }, { onError: (e) => (isQuizRunning(e) ? setAsking(true) : undefined) });
  const dialog = (
    <AlertDialog open={asking} onOpenChange={setAsking}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restart the quiz?</AlertDialogTitle>
          <AlertDialogDescription>Every player&apos;s score is cleared. The quiz is already running, on this console or another.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary">Keep it running</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(e) => {
              e.preventDefault();
              host.mutate({ action: "start", notify, restart: true }, { onSettled: () => setAsking(false) });
            }}
          >
            Restart
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { start, dialog, pending: host.isPending };
}

const KIND_WORD: Record<string, string> = {
  multi: "several right answers",
  true_false: "true or false",
  type: "typed answer",
  order: "put in order",
  poll: "poll, no score",
};

function Tally({ q }: { q: NonNullable<HostState["question"]> }) {
  const kind = q.kind ?? "single";
  if (kind === "type")
    return (
      <div className="mt-4">
        {q.accepted?.length ? (
          <p className="text-ink-2 text-[12.5px]">
            Counts as right: <span className="text-ink font-medium">{q.accepted.join(" · ")}</span>
          </p>
        ) : null}
        {q.texts && q.texts.length ? (
          <ul className="mt-2 grid gap-1.5" aria-label="What the room typed">
            {q.texts.map((x) => (
              <li key={x.text} className="flex items-center gap-2 text-[12.5px]">
                {x.correct ? <CheckIcon className="text-admit size-3.5" aria-label="Right" /> : <span className="size-3.5" />}
                <span className={cn("flex-1 truncate", x.correct ? "text-admit font-medium" : "text-ink-2")}>{x.text}</span>
                <span className="text-ink-3 font-mono text-[11px] tabular-nums">{x.count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-3 mt-2 text-[12.5px]">Typed answers show here as they come in.</p>
        )}
      </div>
    );
  const order = kind === "order";
  const byKey = new Map(q.options.map((o) => [o.key, o]));
  const rows = order && q.correct_order ? q.correct_order.map((k) => q.counts.find((c) => c.key === k) ?? { key: k, label: byKey.get(k)?.label ?? k, count: 0, correct: true }) : q.counts;
  return (
    <div className="mt-4 grid gap-2.5">
      {order ? <p className="text-ink-3 text-[11.5px]">In the right order, with how many put each in its place.</p> : null}
      {rows.map((c, i) => (
        <div key={c.key}>
          <div className="flex items-center justify-between text-[12.5px]">
            <span className={cn(c.correct && kind !== "order" ? "text-admit font-medium" : "text-ink-2")}>
              <span className="mr-1.5 font-mono text-[11px]" aria-hidden="true">
                {order ? i + 1 : SHAPES[q.options.findIndex((o) => o.key === c.key)]}
              </span>
              {c.label}
            </span>
            <span className="text-ink-3 font-mono text-[11px] tabular-nums">{c.count}</span>
          </div>
          <ProgressBar value={c.count} max={Math.max(1, q.answered)} tone={c.correct && kind !== "order" && kind !== "poll" ? "admit" : "muted"} className="mt-1" />
        </div>
      ))}
    </div>
  );
}

function TeamsList({ teams }: { teams: TeamRow[] }) {
  const max = Math.max(1, ...teams.map((t) => t.score));
  return (
    <div className="mt-4">
      <CardLabel>Teams</CardLabel>
      <ol className="mt-2 grid gap-2">
        {teams.map((t) => (
          <li key={t.key} className="text-[12.5px]">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className="inline-block size-2.5 rounded-full" style={{ background: t.color }} aria-hidden="true" />
                <span className="text-ink">{t.name}</span>
                {t.players != null ? <span className="text-ink-3 text-[11px]">{t.players} playing</span> : null}
              </span>
              <span className="text-ink-2 font-mono tabular-nums">{t.score}</span>
            </div>
            <div className="bg-muted mt-1 h-1.5 w-full overflow-hidden rounded-full">
              <div className="h-full rounded-full" style={{ width: `${Math.round((t.score / max) * 100)}%`, background: t.color }} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** What the clock says: the phase when it is not just counting. */
function clockLabel(s: HostState, q: NonNullable<HostState["question"]>) {
  const phase = phaseOf(s);
  if (phase === "paused") return "Paused";
  if (phase === "closed") return "Answers in";
  if (phase === "revealed" && s.settings?.flow.reveal === "host") return "Revealed";
  return q.time_left === 0 ? "Time" : `${q.time_left}s`;
}

function QuestionControls({ eventId, quizId, s }: { eventId: number; quizId: string | null; s: HostState }) {
  const { host } = useRoundMutations(eventId, quizId);
  const phase = phaseOf(s);
  const last = s.current_index + 1 >= s.total;
  const auto = s.settings?.flow.advance === "auto";
  const hostReveal = s.settings?.flow.reveal === "host";
  const until = useSecondsUntil(s.next_at);
  const noun = (s.round?.count ?? 1) > 1 ? "round" : "quiz";
  const ending = useConfirmed(
    { title: `End the ${noun} now?`, body: "Every phone leaves the question and goes to the final board. The questions left are not asked.", confirm: `End the ${noun}` },
    () => host.mutate({ action: "end" }),
  );
  const skipping = useConfirmed(
    { title: "Skip this question?", body: "Its answers are removed and their points taken back, then the next question opens.", confirm: "Skip it" },
    () => host.mutate({ action: "skip" }),
  );
  const [again, setAgain] = React.useState<string>("");
  const next = () => host.mutate({ action: "next", expectedIndex: s.current_index });
  const busy = host.isPending;
  // The new controls need a server that knows the phases; against one from before only Next and End show.
  const v2 = Boolean(s.phase);
  return (
    <div className="mt-4 grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {phase === "closed" ? (
          <Button onClick={() => host.mutate({ action: "reveal" })} disabled={busy}>
            Reveal the answer
          </Button>
        ) : phase === "paused" ? (
          <Button onClick={() => host.mutate({ action: "resume" })} disabled={busy}>
            <PlayIcon className="size-4" /> Resume
          </Button>
        ) : (
          <Button onClick={next} disabled={busy}>
            {last ? "Finish and show the board" : "Next question"}
          </Button>
        )}
        {v2 && phase === "question" ? (
          <Button variant="outline" onClick={() => host.mutate({ action: "pause" })} disabled={busy}>
            <PauseIcon className="size-4" /> Pause
          </Button>
        ) : null}
        {v2 && (phase === "question" || phase === "paused" || phase === "closed") ? (
          <Button variant="ghost" onClick={skipping.ask} disabled={busy}>
            <SkipForwardIcon className="size-4" /> Skip
          </Button>
        ) : null}
        {v2 && phase === "revealed" ? (
          <Button variant="ghost" onClick={() => host.mutate({ action: "reopen", index: s.current_index })} disabled={busy}>
            <RotateCcwIcon className="size-4" /> Ask it again
          </Button>
        ) : null}
        <Button variant="ghost" className="btn-danger" onClick={ending.ask}>
          End early
        </Button>
      </div>
      {v2 && (phase === "revealed" || phase === "closed") && s.current_index > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect size="sm" className="w-[220px]" aria-label="Ask an earlier question again" value={again} onChange={(e) => setAgain(e.target.value)}>
            <option value="">Ask an earlier one again…</option>
            {Array.from({ length: s.current_index }, (_, i) => (
              <option key={i} value={i}>
                Question {i + 1}
              </option>
            ))}
          </NativeSelect>
          <Button size="sm" variant="outline" disabled={again === "" || busy} onClick={() => (host.mutate({ action: "reopen", index: Number(again) }), setAgain(""))}>
            Open it
          </Button>
        </div>
      ) : null}
      <span className="text-ink-3 text-[11.5px]">
        {auto && until !== null
          ? `Moves on by itself in ${until} s — or press Next now.`
          : hostReveal && phase === "question"
            ? "When time is up, answers close and the answer waits for your Reveal."
            : "Every phone in the room changes the moment you press it."}
      </span>
      {ending.dialog}
      {skipping.dialog}
    </div>
  );
}

export function HostConsole({ eventId, quizId, checkedIn }: { eventId: number; quizId: string | null; checkedIn?: number | null }) {
  const { host } = useRoundMutations(eventId, quizId);
  const gate = useFeatureGate("quiz", { eventId });
  const state = useRoundHost(eventId, quizId, true);
  const [notify, setNotify] = useNotifyChoice(eventId, "quiz");
  const again = useStart(eventId, quizId, notify);
  // The way in for a phone without the app; the slug comes from the event the console already holds.
  const detail = useEventDetail(eventId);
  const event = { id: eventId, slug: detail.data?.slug };
  const url = roomUrl(event);
  const address = roomAddress(event);
  const s = state.data;
  const ending = useConfirmed(
    { title: "End the quiz now?", body: "Every phone leaves the question and goes to the final board. The questions left are not asked.", confirm: "End the quiz" },
    () => host.mutate({ action: "end" }),
  );
  const resetting = useConfirmed(
    { title: "Back to editing?", body: "The run ends and every player's score is cleared. The questions are kept.", confirm: "Clear and edit" },
    () => host.mutate({ action: "reset" }),
  );
  if (!s) return <Skeleton className="h-64" />;
  const q = s.question;
  const phase = phaseOf(s);
  const kind = q?.kind ?? "single";
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <FigurePanel className="p-5">
          {s.status === "ended" ? (
            <>
              <CardLabel>Finished</CardLabel>
              <p className="text-ink mt-2 text-[15px] font-semibold">That is the quiz. The board on the right stands.</p>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
                <div className="flex gap-2">
                  <Button onClick={gate.guard(again.start)} disabled={host.isPending || again.pending}>
                    Run it again
                  </Button>
                  <Button variant="outline" className="btn-danger" onClick={resetting.ask}>
                    Back to editing
                  </Button>
                </div>
                <NotifySwitch checked={notify} onCheckedChange={setNotify} checkedIn={checkedIn} hint="A push to join, as the quiz opens" />
              </div>
            </>
          ) : q ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <CardLabel>
                  Question {s.current_index + 1} of {s.total}
                  {KIND_WORD[kind] ? ` · ${KIND_WORD[kind]}` : ""}
                  {kind !== "poll" && q.effective_points ? ` · ${q.effective_points} pts` : ""}
                  {q.double ? " · double" : ""}
                </CardLabel>
                <span
                  className={cn("font-mono text-[12px] tabular-nums", phase === "paused" ? "text-caution" : q.time_left === 0 ? "text-ink-3" : "text-caution")}
                  aria-live="polite"
                >
                  {clockLabel(s, q)}
                </span>
              </div>
              <p className="text-ink mt-2 text-[18px] font-semibold tracking-[-0.01em]">{q.prompt}</p>
              <Tally q={q} />
              <p className="text-ink-2 mt-3 text-[12.5px]" aria-live="polite">
                <strong className="text-ink font-mono font-semibold tabular-nums">{q.answered}</strong> of {s.players} answered
                {q.fully_correct != null && phase === "revealed" && kind !== "poll" ? ` · ${q.fully_correct} fully right` : ""}
              </p>
              <ProgressBar value={q.answered} max={Math.max(1, s.players)} tone="accent" height={4} className="mt-1.5" label={`${q.answered} of ${s.players} answered`} />
              <QuestionControls eventId={eventId} quizId={quizId} s={s} />
            </>
          ) : (
            <>
              <CardLabel>Lobby</CardLabel>
              {/* A grid, not a wrapping flex row: the code and the way in stay side by side. */}
              <div className="mt-2 grid items-start gap-5 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <p className="text-ink-2 text-[13px]">Players scan the code on the projector, or open the event page and type this:</p>
                  <p className="text-brand mt-3 font-mono text-[44px] font-semibold tracking-[0.18em]" aria-label={`Join code ${s.join_code ?? ""}`}>
                    {s.join_code}
                  </p>
                  <p className="text-ink-3 text-[12.5px]" aria-live="polite">
                    {s.players} {s.players === 1 ? "player" : "players"} in
                  </p>
                </div>
                <JoinQr url={url} address={address} size={116} label="The room" printable filename={`join-${eventId}`} className="shrink-0" />
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={() => host.mutate({ action: "next", expectedIndex: s.current_index })} disabled={host.isPending}>
                  <PlayIcon className="size-4" /> Ask the first question
                </Button>
                <Button variant="ghost" className="btn-danger" onClick={ending.ask}>
                  Cancel the quiz
                </Button>
              </div>
            </>
          )}
          {again.dialog}
          {ending.dialog}
          {resetting.dialog}
        </FigurePanel>
        <FigurePanel className="p-5">
          <CardLabel right={<span className="text-ink-3 font-mono text-[11px]">{s.players} playing</span>}>Leaderboard</CardLabel>
          {s.leaderboard.length === 0 ? (
            <p className="text-ink-3 mt-3 text-[12.5px]">Scores appear after the first question.</p>
          ) : (
            <ol className="mt-3 grid gap-1.5">
              {/* Ties share a rank (the backend's board.py), so the key is rank and name together. */}
              {s.leaderboard.map((p) => {
                const team = p.team ? s.teams?.find((t) => t.key === p.team) : undefined;
                return (
                  <li key={`${p.rank}-${p.name}`} className="flex items-center gap-3 text-[13px]">
                    <span className="text-ink-3 w-5 font-mono text-[11px] tabular-nums">{p.rank}</span>
                    {team ? <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: team.color }} aria-label={team.name} /> : null}
                    <span className="text-ink flex-1 truncate">{p.name}</span>
                    <span className="text-ink-2 font-mono text-[12px] tabular-nums">{p.score}</span>
                  </li>
                );
              })}
            </ol>
          )}
          {s.teams && s.teams.length ? <TeamsList teams={s.teams} /> : null}
          <Link href={`/present/${eventId}`} target="_blank" className="btn btn-secondary btn-sm mt-4">
            <ExternalLinkIcon className="size-3.5" /> Put the code on the projector
          </Link>
        </FigurePanel>
      </div>
      {s.status === "ended" && quizId ? <WinnersPanel eventId={eventId} quizId={quizId} /> : null}
    </div>
  );
}

// --- winners ----------------------------------------------------------------------

const TOPS = [3, 5, 10, 25] as const;

const seconds = (ms: number | null | undefined) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)} s`);

function MarkResult({ result }: { result: MarkOut }) {
  return (
    <div className="text-ink-2 mt-3 grid gap-1 text-[12.5px]" role="status">
      {result.marked.length ? (
        <p>
          Marked: {result.marked.map((m) => `${m.position ?? m.rank}. ${m.name}`).join(" · ")}. Their certificates can go out from Certificates.
        </p>
      ) : null}
      {result.skipped.length ? (
        <p className="text-caution">Not marked (played without a registration): {result.skipped.map((m) => `${m.rank}. ${m.name}`).join(" · ")}.</p>
      ) : null}
    </div>
  );
}

/**
 * The top players of a round, or across the rounds: export them, or mark
 * them as the event's winners on their registrations (the winners feature
 * the registrations list already has) so winner certificates follow.
 */
export function Winners({
  eventId,
  quizId,
  rows,
  loading,
  top,
  setTop,
  overall,
}: {
  eventId: number;
  /** null: across the rounds. */
  quizId: string | null;
  rows: (Winner | OverallRow)[] | undefined;
  loading: boolean;
  top: number;
  setTop: (n: number) => void;
  overall?: boolean;
}) {
  const { can } = useAccess();
  const mark = useMarkWinners(eventId, quizId);
  const [result, setResult] = React.useState<MarkOut | null>(null);
  const marking = useConfirmed(
    {
      title: `Mark the top ${top} as winners?`,
      body: "Each gets their place on their registration, as the registrations list does, so winner certificates and badges follow. Other placings are left as they are.",
      confirm: `Mark ${top} winners`,
    },
    () => mark.mutate(top, { onSuccess: setResult }),
  );
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrophyIcon className="text-brand size-4" aria-hidden="true" />
          <span className="text-ink text-[14px] font-semibold">{overall ? "Winners across the rounds" : "Winners"}</span>
          <NativeSelect size="sm" className="w-[96px]" aria-label="How many winners" value={top} onChange={(e) => setTop(Number(e.target.value))}>
            {TOPS.map((n) => (
              <option key={n} value={n}>
                Top {n}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can.exports ? <ExportMenu size="sm" href={winnersExportUrl(eventId, quizId, top)} label="Export" title="The top players with their registration details" /> : null}
          {can.edit_events ? (
            <Button size="sm" onClick={marking.ask} disabled={mark.isPending || !rows?.length}>
              Mark as winners
            </Button>
          ) : null}
        </div>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-24" />
      ) : !rows?.length ? (
        <p className="text-ink-3 mt-3 text-[12.5px]">Nobody played this round.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead className="text-ink-3 font-mono text-[10.5px] tracking-[0.06em] uppercase">
              <tr>
                <th className="py-1.5 pr-3 font-medium">#</th>
                <th className="py-1.5 pr-3 font-medium">Name</th>
                <th className="py-1.5 pr-3 text-right font-medium">Score</th>
                {overall ? <th className="py-1.5 pr-3 text-right font-medium">Rounds</th> : <th className="py-1.5 pr-3 text-right font-medium">Right</th>}
                {overall ? null : <th className="py-1.5 pr-3 text-right font-medium">Time</th>}
                <th className="py-1.5 font-medium">Registration</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.rank}-${r.name}`} className="border-line-soft border-t">
                  <td className="text-ink-3 py-1.5 pr-3 font-mono tabular-nums">{r.rank}</td>
                  <td className="text-ink py-1.5 pr-3">{r.name}</td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{r.score}</td>
                  {"rounds" in r ? (
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{r.rounds ?? "—"}</td>
                  ) : (
                    <>
                      <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{(r as Winner).correct ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{seconds((r as Winner).time_ms)}</td>
                    </>
                  )}
                  <td className="py-1.5">
                    {r.registration ? (
                      <span className="flex items-center gap-2">
                        <span className="text-ink-2">{r.registration.full_name ?? "Registered"}</span>
                        {r.registration.position ? <StatusBadge tone="success" label={`Winner · ${r.registration.position}`} /> : null}
                      </span>
                    ) : (
                      <span className="text-ink-3">Played without one</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result ? <MarkResult result={result} /> : null}
      {marking.dialog}
    </div>
  );
}

function WinnersPanel({ eventId, quizId }: { eventId: number; quizId: string }) {
  const [top, setTop] = React.useState(3);
  const winners = useWinners(eventId, quizId, top);
  return (
    <FigurePanel className="p-5">
      <Winners eventId={eventId} quizId={quizId} rows={winners.data} loading={winners.isPending} top={top} setTop={setTop} />
    </FigurePanel>
  );
}

/** The board across the event's rounds, with its own export and marking. */
export function OverallPanel({ eventId }: { eventId: number }) {
  const [top, setTop] = React.useState(3);
  const overall = useOverall(eventId, Math.max(top, 10));
  const rows = overall.data ?? undefined;
  return <Winners eventId={eventId} quizId={null} rows={rows?.slice(0, Math.max(top, 10))} loading={overall.isPending} top={top} setTop={setTop} overall />;
}
