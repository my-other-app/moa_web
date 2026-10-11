"use client";

import * as React from "react";
import { XIcon } from "lucide-react";
import { cn } from "@moa/ui";

import { HAPTIC, type OutcomeCardModel, type Tone } from "../lib/outcome-copy";

const TONE: Record<Tone, string> = {
  admit: "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  caution: "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  refuse: "border-destructive/60 bg-destructive/10 text-destructive",
  accent: "border-primary/60 bg-primary/10 text-primary",
};

/** The verdict, large, with what to do next. One tap on admit, two on refuse. */
export function OutcomeCard({ card, onDismiss, children }: { card: OutcomeCardModel; onDismiss: () => void; children?: React.ReactNode }) {
  React.useEffect(() => {
    try {
      navigator.vibrate?.(HAPTIC[card.tone]);
    } catch {
      /* unsupported */
    }
  }, [card]);
  return (
    <div role="status" aria-live="assertive" className={cn("overflow-hidden rounded-xl border-[1.5px]", TONE[card.tone])}>
      <div className="px-4 py-3.5">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded bg-card px-1.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.1em]">{card.tag}</span>
          <span className="flex-1" />
          <button type="button" onClick={onDismiss} aria-label="Dismiss" className="opacity-60 hover:opacity-100">
            <XIcon className="size-4" />
          </button>
        </div>
        <div className="text-[20px] font-medium leading-[1.25] tracking-[-0.01em]">{card.title}</div>
        {card.sub ? <div className="mt-1.5 font-mono text-[12px] leading-[1.5] tracking-[0.03em] opacity-85">{card.sub}</div> : null}
        {card.attribution ? (
          <div className="mt-2.5 rounded-md border border-current/30 bg-card/70 px-3 py-2.5">
            <div className="mb-1 font-mono text-[9px] font-medium tracking-[0.1em] opacity-70">ALREADY SCANNED BY</div>
            <div className="text-[13px] leading-[1.5]">{card.attribution}</div>
          </div>
        ) : null}
        {card.note ? <div className="mt-2.5 text-[12.5px] leading-[1.55] opacity-85">{card.note}</div> : null}
      </div>
      {children}
    </div>
  );
}
