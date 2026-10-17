"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { LockIcon, SparklesIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@moa/ui";

import { ENTITLEMENTS_KEY } from "@/features/billing/queries";

import { onUpgrade, planLockFromError } from "../errors";
import { usePlan } from "../queries";
import { UPGRADE_PATH, lockCopy, type PlanLock } from "../schemas";

/**
 * "{Label} is part of {Plan} and up", with the way to the plans.
 *
 * Opened by a lock the dashboard saw coming (a locked control, a create
 * button at its limit) or by the server refusing a write; both arrive as a
 * PlanLock and read the same.
 */
export function UpgradeDialog({ lock, open, onOpenChange }: { lock: PlanLock | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const plan = usePlan();
  // A refusal from the server does not say which plan the club is on; the entitlements do.
  const shown = lock ? { ...lock, planName: lock.planName ?? plan.planName } : null;
  const copy = shown ? lockCopy(shown) : null;
  return (
    <Dialog open={open && shown !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        {copy ? (
          <>
            <DialogHeader>
              <span className="bg-brand-soft text-brand mb-1 grid size-10 place-items-center rounded-xl" aria-hidden="true">
                {shown?.kind === "feature" ? <LockIcon className="size-4" /> : <SparklesIcon className="size-4" />}
              </span>
              <DialogTitle className="text-[17px] leading-[1.3] tracking-[-0.01em]">{copy.title}</DialogTitle>
              <DialogDescription>{copy.body}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button type="button" className="btn btn-secondary" onClick={() => onOpenChange(false)}>
                Not now
              </button>
              <Link href={UPGRADE_PATH} className="btn btn-primary" onClick={() => onOpenChange(false)}>
                See plans
              </Link>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The one upgrade dialog the dashboard has, and the reason a plan refusal
 * is never a toast.
 *
 * Every mutation that fails with PLAN_FEATURE_LOCKED or PLAN_LIMIT_REACHED
 * opens it, from the mutation cache, whichever screen sent the write; so do
 * the locked controls (through `openUpgrade`). A refusal also means the
 * counts the dashboard holds are behind, so the entitlements are re-read.
 */
export function PlanLockHost() {
  const queryClient = useQueryClient();
  const [lock, setLock] = React.useState<PlanLock | null>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(
    () =>
      onUpgrade((next) => {
        setLock(next);
        setOpen(true);
      }),
    [],
  );

  React.useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type !== "updated" || event.action.type !== "error") return;
        const next = planLockFromError(event.action.error);
        if (!next) return;
        setLock(next);
        setOpen(true);
        void queryClient.invalidateQueries({ queryKey: ENTITLEMENTS_KEY });
      }),
    [queryClient],
  );

  return <UpgradeDialog lock={lock} open={open} onOpenChange={setOpen} />;
}
