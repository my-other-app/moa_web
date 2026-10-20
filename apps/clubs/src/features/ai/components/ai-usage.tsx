"use client";

import Link from "next/link";
import { KeyRoundIcon, SparklesIcon } from "lucide-react";
import { CardLabel, FigurePanel, ProgressBar, StatusBadge, cn } from "@moa/ui";

import { LockBadge, lockCopy } from "@/features/plan";

import { useAiGate, useCanManageAiKey } from "../queries";
import { AI_KEY_PATH, PROVIDER_SHORT, quotaReached, resetDay, usageLine, type AiProvider, type AiStatus } from "../schemas";

/**
 * How much AI the club has used: one line in each AI dialog, a panel on
 * Plan & billing. Nothing while AI is off; with the club's own key, which
 * key, and no count (its provider bills it).
 */

/** "AI actions: 12 of 150 this month, resets 1 Nov", small, under an AI dialog. */
export function AiUsageMeter({ status, className }: { status: AiStatus | undefined; className?: string }) {
  if (!status?.enabled) return null;
  const full = quotaReached(status);
  return (
    <p data-slot="ai-usage" className={cn("m-0 flex items-center gap-1.5 text-[11.5px] tabular-nums", full ? "text-caution" : "text-ink-3", className)}>
      {status.byok ? <KeyRoundIcon className="size-3 shrink-0" aria-hidden="true" /> : <SparklesIcon className="size-3 shrink-0" aria-hidden="true" />}
      <span>{usageLine(status)}</span>
    </p>
  );
}

const providerName = (p: string | null) => (p && p in PROVIDER_SHORT ? PROVIDER_SHORT[p as AiProvider] : "AI");

/** The AI panel on Plan & billing. */
export function AiUsagePanel() {
  const gate = useAiGate();
  const canKey = useCanManageAiKey();
  const s = gate.status;
  if (!gate.visible || !s) return null;
  const full = quotaReached(s);
  const day = resetDay(s.resets_at);

  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="AI assist">
      <CardLabel right={s.byok ? <StatusBadge label="Your own key" tone="success" /> : gate.locked ? <LockBadge lock={gate.lock} /> : full ? <StatusBadge label="Used up" tone="warning" /> : null}>
        AI assist
      </CardLabel>
      {s.byok ? (
        <div className="flex items-start gap-3">
          <span className="bg-admit-soft text-admit grid size-9 shrink-0 place-items-center rounded-xl">
            <KeyRoundIcon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-ink m-0 text-[14px] font-semibold">{usageLine(s)}</p>
            <p className="text-ink-2 m-0 mt-0.5 text-[12.5px] leading-[1.5]">AI actions bill your {providerName(s.provider)} account and don&apos;t count against your plan.</p>
          </div>
        </div>
      ) : gate.locked && gate.lock ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-ink m-0 text-[14px] font-semibold">{lockCopy(gate.lock).title}</p>
            <p className="text-ink-2 m-0 mt-0.5 text-[12.5px] leading-[1.5]">
              Draft events from a poster, write announcements and emails, and summarise feedback.{canKey ? " Or bring your own AI key." : ""}
            </p>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={gate.prompt}>
            Upgrade
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-ink m-0 text-[14px] font-semibold tabular-nums">
              {s.limit === null ? `${s.used.toLocaleString("en-IN")} AI actions this month` : `${s.used.toLocaleString("en-IN")} of ${s.limit.toLocaleString("en-IN")} AI actions this month`}
            </p>
            <span className={cn("text-[12px]", full ? "text-caution font-medium" : "text-ink-3")}>{s.limit === null ? "No monthly limit" : day ? `Resets ${day}` : null}</span>
          </div>
          {s.limit !== null && s.limit > 0 ? <ProgressBar value={Math.min(s.used, s.limit)} max={s.limit} tone={full ? "caution" : "accent"} height={6} label={usageLine(s)} /> : null}
          <p className="text-ink-3 m-0 text-[12px] leading-[1.5]">Each draft, piece of writing or feedback summary is one action.</p>
        </div>
      )}
      {canKey ? (
        <Link href={AI_KEY_PATH} className="text-brand self-start text-[12.5px] underline-offset-2 hover:underline">
          {s.byok ? "Manage your AI key" : "Use your own Gemini or Claude key"}
        </Link>
      ) : null}
    </FigurePanel>
  );
}
