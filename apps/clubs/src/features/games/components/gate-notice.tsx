"use client";

import { LockedNotice } from "@/features/plan";

import { GAME_FEATURE, type GameKind } from "../schemas";

/**
 * "Available on Pro and up": shown over a game the club's plan doesn't
 * include. What is already set up stays readable; changing it needs the plan.
 */
export function GameGateNotice({ kind, eventId, className }: { kind: GameKind; eventId: number; className?: string }) {
  return (
    <LockedNotice feature={GAME_FEATURE[kind]} eventId={eventId} className={className}>
      {(lock) => (
        <>
          <strong className="font-semibold">
            {lock.label} is available on {lock.requiredPlanName ? `${lock.requiredPlanName} and up` : "a bigger plan"}.
          </strong>{" "}
          What is already set up stays here to look at; switching it on or changing it needs the plan.
        </>
      )}
    </LockedNotice>
  );
}
