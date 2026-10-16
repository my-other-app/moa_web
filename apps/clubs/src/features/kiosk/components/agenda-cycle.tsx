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
  brand,
  dwellMs = 3200,
}: {
  items: KioskContext["agenda"];
  brand: string;
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
    <div className="relative mx-auto mt-8 h-[200px] w-full max-w-xl overflow-hidden rounded-3xl border border-white/[0.06] bg-white/[0.035] text-left">
      <div
        key={`${a.starts_at}-${a.title}`}
        className="absolute inset-0 flex flex-col justify-center p-7 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
      >
        <span
          className="font-mono text-[15px] tracking-[0.08em]"
          style={{ color: brand }}
        >
          {time(a.starts_at)}
          {a.ends_at ? ` – ${time(a.ends_at)}` : ""}
          {a.parallel ? " · PARALLEL" : ""}
        </span>
        <span className="mt-3 text-[26px] font-medium leading-[1.25] tracking-[-0.015em] text-white">
          {a.title}
        </span>
        <span className="mt-2 text-[17px] leading-[1.5] text-[#9AA59C]">
          {[a.speaker, a.location].filter(Boolean).join(" · ")}
        </span>
      </div>
      {items.length > 1 ? (
        <div
          className="absolute inset-x-0 bottom-5 flex justify-center gap-2"
          aria-hidden
        >
          {items.map((it, n) => (
            <span
              key={`${it.starts_at}-${it.title}`}
              className={cn(
                "size-2 rounded-full transition-colors",
                n === i ? "" : "bg-white/15",
              )}
              style={n === i ? { background: brand } : undefined}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
