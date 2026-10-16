"use client";

import * as React from "react";
import { cn } from "@moa/ui";

import type { KioskContext } from "../schemas";

const time = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

/**
 * The run of show, one item at a time, while the card prints. Cycling in
 * React rather than with staggered CSS delays: a fixed keyframe duration
 * shows every item at once as soon as there is more than one.
 */
export function AgendaCycle({
  items,
  dwellMs = 3200,
}: {
  items: KioskContext["agenda"];
  dwellMs?: number;
}) {
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % items.length), dwellMs);
    return () => clearInterval(t);
  }, [items.length, dwellMs]);
  const a = items[i % items.length];
  if (!a) return null;
  return (
    <div className="bg-surface border-line-soft relative mx-auto mt-8 h-[208px] w-full max-w-xl overflow-hidden rounded-[var(--radius-sheet)] border text-left">
      <div
        key={`${a.starts_at}-${a.title}`}
        className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 absolute inset-0 flex flex-col justify-center p-7"
      >
        <span className="text-brand font-mono text-[15px] tracking-[0.04em] tabular-nums">
          {time(a.starts_at)}
          {a.ends_at ? ` – ${time(a.ends_at)}` : ""}
          {a.parallel ? " · Parallel" : ""}
        </span>
        <span className="text-ink mt-3 text-[26px] leading-[1.25] font-medium tracking-[-0.015em]">
          {a.title}
        </span>
        <span className="text-ink-2 mt-2 text-[17px] leading-[1.5]">
          {[a.speaker, a.location].filter(Boolean).join(" · ")}
        </span>
      </div>
      {items.length > 1 ? (
        <div
          className="absolute inset-x-0 bottom-5 flex justify-center gap-2"
          aria-hidden="true"
        >
          {items.map((it, n) => (
            <span
              key={`${it.starts_at}-${it.title}`}
              className={cn(
                "size-2 rounded-full transition-colors",
                n === i ? "bg-brand" : "bg-line",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
