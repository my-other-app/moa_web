"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { formatDate } from "@moa/app-kit";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Notice } from "@moa/ui";

import { useEndTrial, useGrantEnterpriseTrial } from "../queries";
import { ENTERPRISE_TRIAL_DAYS, runningTrial, trialDaysProblem, type Subscription } from "../schemas";

const DAY_MS = 86_400_000;

/**
 * "Grant Enterprise trial": Enterprise laid over the club for N days (30 by
 * default), after a sales call. Nothing is charged and the club's own plan --
 * a paid subscription, its free trial -- carries on underneath and is what it
 * has again when the trial ends. Granting again sets a new end from today.
 */
export function EnterpriseTrialDialog({ club, row, onClose }: { club: { id: number; name: string }; row: Subscription | null; onClose: () => void }) {
  const grant = useGrantEnterpriseTrial();
  const [days, setDays] = React.useState(String(ENTERPRISE_TRIAL_DAYS.default));
  const [touched, setTouched] = React.useState(false);
  const n = Number(days);
  const problem = days.trim() === "" ? "How many days?" : trialDaysProblem(n);
  // When the dialog opened: what the trial is counted from.
  const [openedAt] = React.useState(() => Date.now());
  const until = problem ? null : new Date(openedAt + n * DAY_MS);
  const running = row?.enterprise_trial ?? null;
  const underneath = row && row.status !== "cancelled" && row.plan ? row.plan.name : "Free";
  const refused = grant.error instanceof Error ? grant.error.message : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    grant.mutate({ clubId: club.id, days: n }, { onSuccess: onClose });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Grant {club.name} an Enterprise trial</DialogTitle>
            <DialogDescription>
              Everything Enterprise includes, free, for as long as you set. Nothing is charged, and what the club has now ({underneath}
              {row?.free_trial ? ", on its free trial" : ""}) carries on underneath: when the trial ends, it is back on that.
            </DialogDescription>
          </DialogHeader>
          {running ? <Notice tone="accent">An Enterprise trial already runs until {formatDate(running.ends_at)}. This sets a new end, counted from today.</Notice> : null}
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">Days</span>
            <input
              className="input w-[120px]"
              type="number"
              inputMode="numeric"
              min={ENTERPRISE_TRIAL_DAYS.min}
              max={ENTERPRISE_TRIAL_DAYS.max}
              step={1}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={touched && problem ? true : undefined}
              aria-describedby="trial-days-help"
            />
            <span id="trial-days-help" className={touched && problem ? "text-refuse text-[12px]" : "text-ink-3 text-[12px]"}>
              {touched && problem ? problem : until ? `Enterprise until ${formatDate(until)}, then back to ${underneath}.` : `${ENTERPRISE_TRIAL_DAYS.min} to ${ENTERPRISE_TRIAL_DAYS.max} days.`}
            </span>
          </label>
          {refused ? <Notice tone="refuse">{refused.replace(/\.$/, "")}. Nothing was changed.</Notice> : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Not now
            </Button>
            <Button type="submit" disabled={grant.isPending}>
              {grant.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null} Grant trial
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "End trial": the running trial ends now (the Enterprise one first). */
export function EndTrialDialog({ club, row, onClose }: { club: { id: number; name: string }; row: Subscription; onClose: () => void }) {
  const end = useEndTrial();
  const trial = runningTrial(row);
  const refused = end.error instanceof Error ? end.error.message : null;
  if (!trial) return null;
  const after =
    trial.kind === "enterprise"
      ? row.free_trial
        ? `its free ${row.trial_plan?.name ?? "Pro"} trial`
        : row.status !== "cancelled" && row.entitled && row.plan
          ? row.plan.name
          : "Free"
      : row.billing_starts_at && row.plan
        ? `${row.plan.name}, the plan it picked`
        : "Free";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>
            End {club.name}&apos;s {trial.kind === "enterprise" ? "Enterprise" : trial.planName} trial?
          </DialogTitle>
          <DialogDescription>
            It runs until {formatDate(trial.endsAt)}. Ending it now puts the club on {after}, and the club is emailed that its trial has ended.
            {trial.kind === "free" ? " A club gets one free trial: this one does not come back." : ""}
          </DialogDescription>
        </DialogHeader>
        {refused ? <Notice tone="refuse">{refused.replace(/\.$/, "")}. Nothing was changed.</Notice> : null}
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Keep it
          </Button>
          <Button type="button" variant="destructive" disabled={end.isPending} onClick={() => end.mutate({ clubId: club.id, trial: trial.kind }, { onSuccess: onClose })}>
            {end.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null} End trial
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
