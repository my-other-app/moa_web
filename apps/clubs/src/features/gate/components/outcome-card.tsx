"use client";

import * as React from "react";
import { XIcon } from "lucide-react";
import { cn } from "@moa/ui";

import { HAPTIC, type OutcomeCardModel, type Tone } from "../lib/outcome-copy";
import { DoorIconButton, TONE_ICON, TONE_LINE, TONE_SOLID, type DoorTone } from "./door-kit";

/** A queued scan is saved, not admitted: it reads in the info tone, never as a welcome. */
const DOOR_TONE: Record<Tone, DoorTone> = { admit: "admit", caution: "caution", refuse: "refuse", accent: "info" };

/**
 * The verdict, large, with what to do next. The band is the tone in a solid
 * fill with the verdict in a word or two — welcome in, already in, not paid,
 * wrong event — so it reads from two metres before the name does. One tap on
 * admit, two on refuse.
 */
export function OutcomeCard({ card, onDismiss, children }: { card: OutcomeCardModel; onDismiss: () => void; children?: React.ReactNode }) {
  React.useEffect(() => {
    try {
      navigator.vibrate?.(HAPTIC[card.tone]);
    } catch {
      /* unsupported */
    }
  }, [card]);
  const tone = DOOR_TONE[card.tone];
  const Icon = TONE_ICON[tone];
  return (
    <div role="status" aria-live="assertive" data-tone={tone} className={cn("bg-surface shadow-card overflow-hidden rounded-[var(--radius-panel)] border", TONE_LINE[tone])}>
      <div className={cn("flex items-center gap-3 px-4 py-3.5", TONE_SOLID[tone])}>
        <Icon aria-hidden="true" className="size-8 shrink-0" />
        <span className="min-w-0 flex-1 text-[26px] leading-[1.1] font-semibold tracking-[-0.02em]">{card.tag}</span>
      </div>
      <div className="flex items-start gap-3 px-4 pt-3.5 pb-4">
        <div className="min-w-0 flex-1">
          <p className="text-ink text-[19px] leading-[1.3] font-semibold tracking-[-0.01em]">{card.title}</p>
          {card.sub ? <p className="text-ink-2 mt-1 font-mono text-[12px] leading-[1.5] tracking-[0.03em]">{card.sub}</p> : null}
        </div>
        <DoorIconButton label="Dismiss" variant="quiet" onClick={onDismiss} className="-mt-1.5 -mr-2">
          <XIcon />
        </DoorIconButton>
      </div>
      {card.attribution ? (
        <div className="border-line-soft bg-sunken mx-4 mb-3 rounded-[var(--radius-md)] border px-3 py-2.5">
          <p className="eyebrow">Already scanned by</p>
          <p className="text-ink mt-1 text-[14px] leading-[1.5]">{card.attribution}</p>
        </div>
      ) : null}
      {card.note ? <p className="text-ink-2 px-4 pb-4 text-[13.5px] leading-[1.55]">{card.note}</p> : null}
      {children}
    </div>
  );
}
