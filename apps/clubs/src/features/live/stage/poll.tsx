"use client";

import * as React from "react";
import { StarIcon } from "lucide-react";

import type { Poll, PollSettings } from "../schemas";
import { Eyebrow, Panel, Timer, t, u, useFit, useSecondsUntil } from "./parts";

/**
 * A poll on the big screen: its question and its results drawn the way the
 * poll says (bars, columns, a donut, a word cloud), its timer when it has
 * one, and nothing but the count while its results are held back.
 */

type Choice = { label: string; count: number; pct: number };

/** "73% · 30", "73%" or "30": the poll's `show`. */
export function figure(c: { count: number; pct: number }, show: PollSettings["show"]) {
  return show === "percent" ? `${c.pct}%` : show === "count" ? `${c.count}` : `${c.pct}% · ${c.count}`;
}

/** The answers' colours on the stage, in order: the theme's six, round and round. */
const fill = (i: number) => `var(--lt-a${i % 6})`;

export function Bars({ choices, show, images }: { choices: Choice[]; show: PollSettings["show"]; images?: (string | null)[] }) {
  return (
    <ul className="grid" style={{ gap: u(1.2) }}>
      {choices.map((c, i) => (
        <li key={c.label} style={{ fontSize: t(2) }}>
          <div className="flex items-center justify-between" style={{ gap: u(1.5) }}>
            <span className="flex min-w-0 items-center" style={{ gap: u(1) }}>
              {images?.[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={images[i]!} alt="" className="shrink-0 rounded-[0.4em] object-cover" style={{ width: u(4), height: u(4) }} />
              ) : null}
              <span className="truncate">{c.label}</span>
            </span>
            <span className="shrink-0 font-mono tabular-nums" style={{ color: "var(--lt-muted)" }}>
              {figure(c, show)}
            </span>
          </div>
          <span className="mt-[0.35em] block overflow-hidden rounded-full" style={{ height: u(1.2), background: "var(--lt-panel-line)" }}>
            <span className="block h-full rounded-full" style={{ width: `${Math.min(100, c.pct)}%`, background: "var(--lt-accent)", transition: "width 0.5s ease" }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Columns({ choices, show }: { choices: Choice[]; show: PollSettings["show"] }) {
  const { level } = useFit();
  const max = Math.max(1, ...choices.map((c) => c.pct));
  return (
    <ul className="flex items-end justify-center" style={{ gap: u(2), height: u(level >= 1 ? 19 : 26) }}>
      {choices.map((c, i) => (
        <li key={c.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" style={{ gap: u(0.6), maxWidth: u(16) }}>
          <span className="font-mono tabular-nums" style={{ fontSize: t(1.8) }}>
            {figure(c, show)}
          </span>
          <span className="block w-full rounded-t-[0.4em]" style={{ height: `${(c.pct / max) * 78}%`, minHeight: u(0.6), background: fill(i), transition: "height 0.5s ease" }} />
          <span className="w-full truncate text-center" style={{ fontSize: t(1.7) }}>
            {c.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Donut({ choices, show, responses }: { choices: Choice[]; show: PollSettings["show"]; responses: number }) {
  const { level } = useFit();
  const total = Math.max(1, choices.reduce((n, c) => n + c.count, 0));
  const r = 40;
  const c = 2 * Math.PI * r;
  // Where each part starts round the ring: the parts before it, added up.
  const starts = choices.map((_, i) => choices.slice(0, i).reduce((n, ch) => n + ch.count / total, 0));
  return (
    <div className="grid items-center" style={{ gridTemplateColumns: "auto 1fr", gap: u(4) }}>
      <svg viewBox="0 0 100 100" className="-rotate-90" style={{ width: u(level >= 1 ? 15 : 20), height: u(level >= 1 ? 15 : 20) }} role="img" aria-label="Results as a donut">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--lt-panel-line)" strokeWidth="16" />
        {choices.map((ch, i) => {
          const part = ch.count / total;
          return (
            <circle
              key={ch.label}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={fill(i)}
              strokeWidth="16"
              strokeDasharray={`${part * c} ${c}`}
              strokeDashoffset={-starts[i]! * c}
            />
          );
        })}
      </svg>
      <ul className="grid" style={{ gap: u(level >= 1 ? 0.6 : 1) }}>
        {choices.map((ch, i) => (
          <li key={ch.label} className="flex items-center" style={{ gap: u(1.2), fontSize: t(level >= 1 ? 1.8 : 2) }}>
            <span aria-hidden="true" className="inline-block shrink-0 rounded-full" style={{ width: "0.7em", height: "0.7em", background: fill(i) }} />
            <span className="min-w-0 flex-1 truncate">{ch.label}</span>
            <span className="font-mono tabular-nums" style={{ color: "var(--lt-muted)" }}>
              {figure(ch, show)}
            </span>
          </li>
        ))}
        <li style={{ fontSize: t(1.5), color: "var(--lt-muted)" }}>{responses} answered</li>
      </ul>
    </div>
  );
}

export function Cloud({ words }: { words: { word: string; count: number }[] }) {
  if (words.length === 0) return <p style={{ fontSize: t(2), color: "var(--lt-muted)" }}>Words appear as they come in.</p>;
  const max = Math.max(...words.map((w) => w.count));
  const min = Math.min(...words.map((w) => w.count));
  const size = (n: number) => 1.8 + (max === min ? 2 : (4.4 * (n - min)) / (max - min));
  return (
    <p className="flex flex-wrap items-baseline justify-center text-center leading-[1.2]" style={{ gap: `${u(0.6)} ${u(1.8)}` }}>
      {words.map((w, i) => (
        <span
          key={w.word}
          className="font-semibold"
          style={{ fontSize: t(size(w.count)), color: i === 0 ? "var(--lt-accent)" : i < 4 ? "var(--lt-on-bg)" : "var(--lt-muted)", fontFamily: "var(--lt-font-display)" }}
          title={`${w.count}`}
        >
          {w.word}
        </span>
      ))}
    </p>
  );
}

function Rating({ poll }: { poll: Poll }) {
  const r = poll.results.rating;
  const scale = r?.scale ?? poll.settings?.scale ?? 5;
  const stars = (poll.settings?.style ?? (scale === 10 ? "numbers" : "stars")) === "stars";
  return (
    <div className="grid items-center" style={{ gridTemplateColumns: "auto 1fr", gap: u(4) }}>
      <div className="text-center">
        <p className="font-semibold tabular-nums" style={{ fontSize: t(8), color: "var(--lt-accent)", fontFamily: "var(--lt-font-display)" }}>
          {r?.average ?? "–"}
        </p>
        <p className="flex items-center justify-center" style={{ gap: u(0.4), fontSize: t(1.8), color: "var(--lt-muted)" }}>
          {stars ? <StarIcon aria-hidden="true" style={{ width: "1em", height: "1em" }} /> : null} out of {scale}
        </p>
      </div>
      <ul className="grid" style={{ gap: u(0.7) }}>
        {(r?.histogram ?? []).map((h) => (
          <li key={h.value} className="grid items-center" style={{ gridTemplateColumns: "2em 1fr 3.5em", gap: u(1), fontSize: t(1.7) }}>
            <span className="font-mono">{h.value}</span>
            <span className="block overflow-hidden rounded-full" style={{ height: u(1), background: "var(--lt-panel-line)" }}>
              <span className="block h-full rounded-full" style={{ width: `${h.pct}%`, background: "var(--lt-accent)" }} />
            </span>
            <span className="text-right font-mono tabular-nums" style={{ color: "var(--lt-muted)" }}>
              {h.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Ranking({ poll }: { poll: Poll }) {
  const rows = poll.results.ranking ?? [];
  return (
    <ol className="grid" style={{ gap: u(1) }}>
      {rows.map((r, i) => (
        <li key={r.label} className="flex items-center rounded-[0.7em]" style={{ gap: u(1.6), padding: `${u(1)} ${u(1.6)}`, fontSize: t(2.2), background: i === 0 ? "var(--lt-accent)" : "var(--lt-panel)", color: i === 0 ? "var(--lt-on-accent)" : undefined }}>
          <span className="font-mono font-semibold tabular-nums">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate">{r.label}</span>
          {r.average != null ? (
            <span className="font-mono tabular-nums" style={{ fontSize: "0.75em", opacity: 0.8 }}>
              avg place {r.average}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function Texts({ poll }: { poll: Poll }) {
  const texts = poll.results.texts ?? [];
  if (texts.length === 0) return <p style={{ fontSize: t(2), color: "var(--lt-muted)" }}>Answers show here once the host approves them.</p>;
  return (
    <ul className="grid grid-cols-3" style={{ gap: u(1.2) }}>
      {texts.slice(0, 12).map((x) => (
        <li key={x.id}>
          <Panel style={{ padding: u(1.6) }}>
            <p style={{ fontSize: t(1.9) }} className="leading-[1.3]">
              {x.text}
            </p>
            {x.name ? <p style={{ marginTop: u(0.6), fontSize: t(1.3), color: "var(--lt-muted)" }}>{x.name}</p> : null}
          </Panel>
        </li>
      ))}
    </ul>
  );
}

export function PollResultsStage({ poll }: { poll: Poll }) {
  const show = poll.settings?.show ?? "both";
  const chart = poll.settings?.chart ?? (poll.kind === "words" ? "cloud" : "bar");
  const choices = poll.results.choices ?? [];
  const images = (poll.option_images ?? []).map((m) => m?.large ?? m?.medium ?? null);
  if (poll.kind === "words") return <Cloud words={poll.results.words ?? []} />;
  if (poll.kind === "rating") return <Rating poll={poll} />;
  if (poll.kind === "ranking") return <Ranking poll={poll} />;
  if (poll.kind === "text") return <Texts poll={poll} />;
  if (chart === "column") return <Columns choices={choices} show={show} />;
  if (chart === "donut") return <Donut choices={choices} show={show} responses={poll.results.responses} />;
  return <Bars choices={choices} show={show} images={images} />;
}

/** Whether the screen has only the count of a poll (its results held back on the screen while it runs). */
const heldBack = (poll: Poll) =>
  poll.status === "live" && !poll.results.choices && !poll.results.words && !poll.results.rating && !poll.results.ranking && !poll.results.texts;

export function PollStage({ poll, timer }: { poll: Poll; timer: "bar" | "ring" | "number" | "hidden" }) {
  const { level } = useFit();
  const live = poll.status === "live";
  const left = useSecondsUntil(live ? poll.closes_at : null, "nearest");
  const seconds = poll.settings?.seconds ?? null;
  const max = poll.settings?.max_choices ?? 1;
  return (
    <div className="flex h-full min-h-0 flex-col" style={{ gap: u(level >= 1 ? 1.4 : 2) }}>
      <div className="flex items-center justify-between" style={{ gap: u(2) }}>
        <Eyebrow>
          {live ? "Poll" : "Poll · closed"} · {poll.results.responses} answered
          {poll.kind === "choice" && max > 1 ? ` · pick up to ${max}` : ""}
        </Eyebrow>
        {left !== null && seconds && timer !== "hidden" && timer !== "bar" ? <Timer style={timer} left={left} seconds={seconds} /> : null}
      </div>
      {left !== null && seconds && timer === "bar" ? <Timer style="bar" left={left} seconds={seconds} /> : null}
      <h2 className="leading-[1.12] font-semibold tracking-[-0.02em]" style={{ fontSize: t(level >= 1 ? 3.2 : 4), fontFamily: "var(--lt-font-display)" }}>
        {poll.prompt}
      </h2>
      <div className="min-h-0 flex-1">
        {heldBack(poll) ? (
          <Panel className="grid place-items-center text-center" style={{ minHeight: u(14) }}>
            <p style={{ fontSize: t(2.4) }}>Vote on your phone — the results show when the poll closes.</p>
          </Panel>
        ) : (
          <PollResultsStage poll={poll} />
        )}
      </div>
    </div>
  );
}
