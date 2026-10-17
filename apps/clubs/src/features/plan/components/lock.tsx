"use client";

import Link from "next/link";
import { LockIcon } from "lucide-react";
import { Notice, ProgressBar, cn } from "@moa/ui";

import { usePlan, useFeatureGate } from "../queries";
import { UPGRADE_PATH, meterText, type PlanLock } from "../schemas";

/**
 * The small marks a lock leaves on a screen: a badge on the control, a
 * notice over an area, a meter beside a create button. Each renders nothing
 * when there is nothing locked, so a screen can place them unconditionally
 * and the kill switch (enforcement off) leaves no trace.
 */

/** A lock and the plan that lifts it, on or beside a control: "🔒 Growth". */
export function LockBadge({ lock, className }: { lock: PlanLock | null; className?: string }) {
  if (!lock) return null;
  const plan = lock.requiredPlanName;
  return (
    <span
      data-slot="lock-badge"
      title={plan ? `Part of ${plan} and up` : "Not on your plan"}
      aria-label={plan ? `Locked: part of ${plan} and up` : "Locked: not on your plan"}
      className={cn("bg-brand-soft text-brand inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.04em] whitespace-nowrap", className)}
    >
      <LockIcon className="size-3" aria-hidden="true" />
      {plan ? <span aria-hidden="true">{plan}</span> : null}
    </span>
  );
}

/**
 * Over an area the plan does not include: what it is, the plan that has it,
 * and that what is already here stays. The area itself stays readable.
 */
export function LockedNotice({ feature, className }: { feature: string; className?: string }) {
  const gate = useFeatureGate(feature);
  if (!gate.lock) return null;
  const { label, requiredPlanName } = gate.lock;
  return (
    <Notice
      tone="accent"
      tag="Plan"
      className={className}
      action={
        <Link href={UPGRADE_PATH} className="btn btn-primary btn-sm">
          See plans
        </Link>
      }
    >
      <strong className="font-semibold">
        {label} {requiredPlanName ? `is part of ${requiredPlanName} and up.` : "isn't on your plan."}
      </strong>{" "}
      Anything already here stays for you to look at; adding to it or changing it needs an upgrade.
    </Notice>
  );
}

/**
 * How much of a limit is used: "2 of 2 events this month · Free", with a
 * thin bar that turns amber at the cap. Nothing for an unlimited plan.
 */
export function LimitMeter({ limitKey, used: override, showPlan = true, className }: { limitKey: string; used?: number | null; showPlan?: boolean; className?: string }) {
  const plan = usePlan();
  const cap = plan.limit(limitKey);
  const used = override ?? plan.used(limitKey);
  if (cap === null || used === null) return null;
  const full = plan.atLimit(limitKey, used);
  const text = meterText(limitKey, used, cap, showPlan ? plan.planName : null);
  return (
    <span
      data-slot="limit-meter"
      role="status"
      className={cn(
        "inline-flex min-w-0 items-center gap-2 rounded-full border px-2.5 py-1 text-[12px] tabular-nums",
        full ? "border-caution-line text-caution" : "border-line text-ink-2",
        className,
      )}
    >
      {full ? <LockIcon className="size-3 shrink-0" aria-hidden="true" /> : null}
      <span className="truncate">{text}</span>
      {cap > 0 ? <ProgressBar value={Math.min(used, cap)} max={cap} tone={full ? "caution" : "accent"} height={4} className="w-10 shrink-0" label={text} /> : null}
    </span>
  );
}
