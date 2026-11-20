"use client";

import * as React from "react";
import { ChevronUpIcon } from "lucide-react";
import { formatTime } from "@moa/app-kit";

import { useQr } from "@/features/links";

import type { AgendaSlot, IdleSlide, LiveUpdate, Question, Sponsor } from "../schemas";
import { usePrefersReducedMotion } from "../theme";
import { Eyebrow, Panel, t, u } from "./parts";

/**
 * The room's parts of the big screen: the join card, the Q&A wall, the idle
 * slides between items, the sponsors along the foot, and the updates as a
 * single strip or a running ticker.
 */

/**
 * The way in, on the stage. The QR is black on its own white card whatever
 * the theme (a tinted QR is one half the phones refuse), error correction
 * H, a four-module quiet zone, drawn from a large picture so a projector
 * does not blur its modules (as JoinQr). The words are in the theme's colours.
 */
export function StageJoin({ url, address, code, size, label = "Scan to join" }: { url: string; address: string; code?: string | null; size: number; label?: string }) {
  const png = useQr(url, 900, { level: "H", margin: 4 });
  return (
    <div className="flex flex-col items-center" style={{ gap: u(0.9) }}>
      <div className="rounded-[0.9em] bg-white shadow-[0_12px_40px_-20px_rgba(0,0,0,0.6)]" style={{ padding: u(size * 0.05), fontSize: t(1) }}>
        {png ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={png} alt={`QR code to join the live room at ${address}`} style={{ width: u(size), height: u(size), imageRendering: "pixelated" }} />
        ) : (
          <span className="block animate-pulse rounded-lg bg-neutral-200" style={{ width: u(size), height: u(size) }} aria-hidden="true" />
        )}
      </div>
      <p className="grid justify-items-center text-center" style={{ gap: u(0.2) }}>
        <span className="font-mono font-semibold tracking-[0.14em] uppercase" style={{ fontSize: t(Math.max(0.9, size * 0.06)), color: "var(--lt-muted)" }}>
          {label}
        </span>
        <span className="font-mono font-semibold whitespace-nowrap" style={{ fontSize: t(Math.max(1.1, size * 0.085)) }}>
          {address}
        </span>
        {code ? (
          <span className="font-mono font-semibold tabular-nums" style={{ fontSize: t(Math.max(1.4, size * 0.16)), letterSpacing: "0.1em", color: "var(--lt-accent)" }} aria-label={`Quiz code ${code}`}>
            {code}
          </span>
        ) : null}
      </p>
    </div>
  );
}

/** The Q&A wall: the pinned question large, the most voted under it. */
export function QAWall({ pinned, wall }: { pinned: Question | null | undefined; wall: Question[] }) {
  const rest = wall.filter((q) => q.id !== pinned?.id);
  if (!pinned && rest.length === 0) return null;
  return (
    <div className="grid h-full min-h-0 content-start" style={{ gap: u(2.4) }}>
      {pinned ? (
        <Panel>
          <Eyebrow>From the floor</Eyebrow>
          <p className="leading-[1.15] font-semibold tracking-[-0.02em]" style={{ marginTop: u(1.2), fontSize: t(4), fontFamily: "var(--lt-font-display)" }}>
            {pinned.text}
          </p>
          <p style={{ marginTop: u(1.2), fontSize: t(1.8), color: "var(--lt-muted)" }}>
            {pinned.author_name || "Anonymous"} · {pinned.votes} {pinned.votes === 1 ? "vote" : "votes"}
          </p>
        </Panel>
      ) : (
        <Eyebrow>Questions from the floor</Eyebrow>
      )}
      {rest.length ? (
        <ul className={rest.length > 3 ? "grid grid-cols-2" : "grid"} style={{ gap: u(1.2) }}>
          {rest.map((q) => (
            <li key={q.id} className="flex items-start rounded-[1em]" style={{ gap: u(1.6), padding: `${u(1.4)} ${u(1.8)}`, background: "var(--lt-panel)" }}>
              <span className="flex shrink-0 flex-col items-center font-mono tabular-nums" style={{ fontSize: t(1.7), color: "var(--lt-muted)" }}>
                <ChevronUpIcon aria-hidden="true" style={{ width: "1.1em", height: "1.1em" }} />
                {q.votes}
              </span>
              <p className="leading-[1.3]" style={{ fontSize: t(2.1) }}>
                {q.text}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The slide on show, turning every `seconds`. */
function useRotation(count: number, seconds: number) {
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    if (count < 2) return;
    const id = window.setInterval(() => setI((n) => n + 1), Math.max(5, seconds) * 1000);
    return () => window.clearInterval(id);
  }, [count, seconds]);
  return count ? i % count : 0;
}

function AgendaSlide({ agenda }: { agenda: AgendaSlot[] }) {
  if (!agenda.length) return <p style={{ fontSize: t(2.6), color: "var(--lt-muted)" }}>The programme shows here.</p>;
  return (
    <div>
      <Eyebrow>The programme</Eyebrow>
      <ol className="grid" style={{ marginTop: u(1.8), gap: u(1.1) }}>
        {agenda.map((a) => (
          <li
            key={a.id}
            className="grid items-baseline rounded-[0.9em]"
            style={{ gridTemplateColumns: "7em 1fr", gap: u(2), padding: `${u(1.2)} ${u(1.8)}`, fontSize: t(2.2), background: a.now ? "var(--lt-accent)" : "var(--lt-panel)", color: a.now ? "var(--lt-on-accent)" : undefined }}
          >
            <span className="font-mono tabular-nums" style={{ fontSize: "0.85em" }}>
              {a.now ? "Now" : formatTime(a.starts_at)}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{a.title}</span>
              {a.speaker || a.location ? (
                <span className="block" style={{ fontSize: "0.72em", opacity: 0.8 }}>
                  {[a.speaker, a.location].filter(Boolean).join(" · ")}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SponsorsSlide({ sponsors }: { sponsors: Sponsor[] }) {
  return (
    <div className="grid h-full content-center justify-items-center text-center">
      <Eyebrow>With thanks to</Eyebrow>
      <ul className="flex flex-wrap items-center justify-center" style={{ marginTop: u(3), gap: u(3) }}>
        {sponsors.map((s) => (
          <li key={s.name} className="grid justify-items-center" style={{ gap: u(0.8) }}>
            {s.logo?.large || s.logo?.medium ? (
              <span className="grid place-items-center rounded-[0.8em] bg-white" style={{ width: u(16), height: u(16), padding: u(1.4) }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.logo.large ?? s.logo.medium ?? undefined} alt={s.name} className="max-h-full max-w-full object-contain" />
              </span>
            ) : (
              <span className="font-semibold" style={{ fontSize: t(3) }}>
                {s.name}
              </span>
            )}
            {s.label ? <span style={{ fontSize: t(1.5), color: "var(--lt-muted)" }}>{s.label}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Between items: the slides the host picked, in turn. */
export function IdleSlides({
  slides,
  seconds,
  agenda,
  sponsors,
  join,
}: {
  slides: IdleSlide[];
  seconds: number;
  agenda: AgendaSlot[];
  sponsors: Sponsor[];
  join: React.ReactNode;
}) {
  // A sponsors slide with no sponsors is skipped rather than shown empty.
  const shown = slides.filter((s) => s !== "sponsors" || sponsors.length > 0);
  const i = useRotation(shown.length, seconds);
  const slide = shown[i];
  return (
    <div className="h-full min-h-0" aria-live="polite" aria-label={slide ? `Slide: ${slide}` : undefined}>
      {slide === "agenda" ? <AgendaSlide agenda={agenda} /> : slide === "sponsors" ? <SponsorsSlide sponsors={sponsors} /> : slide === "join" ? <div className="grid h-full place-items-center">{join}</div> : null}
    </div>
  );
}

/** The sponsors along the foot of the screen. */
export function SponsorStrip({ sponsors }: { sponsors: Sponsor[] }) {
  if (!sponsors.length) return null;
  return (
    <div className="flex items-center justify-center overflow-hidden rounded-[0.8em]" style={{ gap: u(3), padding: `${u(0.8)} ${u(2)}`, background: "var(--lt-panel)" }} aria-label="Sponsors">
      <span className="shrink-0 font-mono tracking-[0.14em] uppercase" style={{ fontSize: t(1), color: "var(--lt-muted)" }}>
        Sponsors
      </span>
      {sponsors.map((s) =>
        s.logo?.medium || s.logo?.thumbnail ? (
          <span key={s.name} className="grid shrink-0 place-items-center rounded-[0.4em] bg-white" style={{ height: u(4), padding: `${u(0.4)} ${u(0.8)}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.logo.medium ?? s.logo.thumbnail ?? undefined} alt={s.name} className="h-full w-auto object-contain" />
          </span>
        ) : (
          <span key={s.name} className="shrink-0 font-semibold" style={{ fontSize: t(1.6) }}>
            {s.name}
          </span>
        ),
      )}
    </div>
  );
}

/** The latest update as a strip (today's), or every recent one running past (the ticker). */
export function Updates({ ticker, updates, latest }: { ticker: boolean; updates: LiveUpdate[]; latest: LiveUpdate | null | undefined }) {
  const reduce = usePrefersReducedMotion();
  const list = updates.length ? updates : latest ? [latest] : [];
  if (!list.length) return null;
  const strip = (
    <span className="shrink-0 font-mono tracking-[0.12em] uppercase" style={{ fontSize: "0.6em", color: "var(--lt-accent)" }}>
      Update
    </span>
  );
  if (!ticker || reduce || list.length === 1)
    return (
      <p className="flex items-baseline rounded-[0.8em]" style={{ gap: u(1.6), padding: `${u(1)} ${u(2)}`, fontSize: t(1.9), background: "var(--lt-panel)", boxShadow: "inset 0 0 0 1px var(--lt-panel-line)" }}>
        {strip}
        <span className="min-w-0">{list[0]!.text}</span>
      </p>
    );
  const run = list.map((x) => x.text).join("   ·   ");
  return (
    <div className="overflow-hidden rounded-[0.8em]" style={{ padding: `${u(1)} 0`, fontSize: t(1.9), background: "var(--lt-panel)" }} role="marquee" aria-label={list.map((x) => x.text).join(". ")}>
      <div className="flex w-max whitespace-nowrap" style={{ animation: `lt-ticker ${Math.max(18, run.length / 4)}s linear infinite` }} aria-hidden="true">
        <span style={{ paddingInline: u(2) }}>{run}</span>
        <span style={{ paddingInline: u(2) }}>{run}</span>
      </div>
      <style>{"@keyframes lt-ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }"}</style>
    </div>
  );
}
