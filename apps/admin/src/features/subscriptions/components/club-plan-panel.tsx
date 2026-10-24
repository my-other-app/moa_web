"use client";

import * as React from "react";
import Link from "next/link";
import { BanIcon, CrownIcon, GiftIcon, HourglassIcon, TimerOffIcon } from "lucide-react";
import { SectionTitle, formatDate, formatNumber } from "@moa/app-kit";
import { Card, CardContent, Skeleton, StatusBadge } from "@moa/ui";

import { useCan } from "@/hooks/use-can";

import { useClubSubscription } from "../queries";
import { freePlanNote, inGrace, runningTrial, rupees, statusLabel, trialBadgeText, type Subscription } from "../schemas";
import { GivePlanDialog } from "./give-plan-dialog";
import { FreeBadge } from "./subscribers-tab";
import { EndFreePlanDialog, canEndFree } from "./subscription-actions";
import { EndTrialDialog, EnterpriseTrialDialog } from "./trial-dialogs";

const STATUS_TONE: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  active: "success",
  trial: "info",
  pending: "warning",
  past_due: "warning",
  paused: "default",
  cancelled: "default",
};

function money(row: Subscription): string {
  if (row.complimentary) return "₹0 · not counted in revenue";
  if (row.free_trial && !row.razorpay_subscription_id) return "Free trial · no card, ₹0";
  if (row.free_trial && row.billing_starts_at) return `Picked ${row.plan?.name ?? "a plan"} · billing starts ${formatDate(row.billing_starts_at)}`;
  if (row.status === "pending") return "Checkout not paid yet";
  if (row.status === "trial") return "On trial · ₹0 so far";
  return `₹${formatNumber(Math.round(rupees(row.mrr_paise)))} a month`;
}

function when(row: Subscription): string | null {
  if (row.complimentary) return null;
  const end = row.current_period_end ? formatDate(row.current_period_end) : null;
  if (!end) return null;
  if (row.status === "cancelled" || row.cancel_at_period_end) return `Ends ${end}`;
  if (row.status === "trial") return `Trial ends ${row.trial_ends_at ? formatDate(row.trial_ends_at) : end}`;
  return `Renews ${end}`;
}

/**
 * The club's plan, on its detail page, and the way to give it one.
 *
 * Every approved club gets "Give plan" here, including the many with no
 * subscription row at all (they are on Free by default). Before this, the
 * only way to move a club was a dropdown on the Subscribers tab, which lists
 * rows -- so a club that had never subscribed could not be upgraded by hand.
 */
export function ClubPlanPanel({ club }: { club: { id: number; name: string; is_verified: boolean } }) {
  const canMoney = useCan("manage_money");
  const { data: row, isPending, isError } = useClubSubscription(club);
  const [dialog, setDialog] = React.useState<"give" | "end_free" | "enterprise_trial" | "end_trial" | null>(null);
  const live = row && row.status !== "cancelled" ? row : null;
  const note = row ? freePlanNote(row) : null;
  // A trial decides the plan whatever the row's own status (an Enterprise
  // trial on a club with no plan sits on a row that grants nothing).
  const trial = runningTrial(row);
  const badge = trialBadgeText(row);
  const shownPlan = trial ? trial.planName : (live?.plan?.name ?? "Free");

  return (
    <section className="space-y-3" aria-label="Plan">
      <SectionTitle>Plan</SectionTitle>
      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="bg-brand-soft text-brand grid size-10 shrink-0 place-items-center rounded-xl" aria-hidden="true">
            {row?.complimentary ? <GiftIcon className="size-4" /> : <CrownIcon className="size-4" />}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            {isPending ? (
              <Skeleton className="h-5 w-48" />
            ) : isError ? (
              <p className="text-muted-foreground text-sm">Could not load the club&apos;s plan.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[16px] font-semibold">{shownPlan}</span>
                  {badge ? <StatusBadge label={badge} tone={trial?.kind === "enterprise" ? "success" : "info"} /> : null}
                  {trial ? null : live ? (
                    <>
                      <span className="text-muted-foreground text-xs capitalize">{live.cycle}</span>
                      <StatusBadge label={statusLabel(live.status)} tone={STATUS_TONE[live.status] ?? "default"} />
                    </>
                  ) : (
                    <StatusBadge label={row ? "Cancelled" : "No subscription"} />
                  )}
                  {live ? <FreeBadge row={live} /> : null}
                  {live && inGrace(live) ? <StatusBadge label={`Grace until ${formatDate(live.grace_ends_at)}`} tone="warning" /> : null}
                </div>
                <p className="text-muted-foreground text-sm">
                  {live ? [money(live), when(live)].filter(Boolean).join(" · ") : "Nothing to pay; what every club has without a plan of its own."}
                </p>
                {live?.complimentary && note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
                {row?.enterprise_trial ? (
                  <p className="text-muted-foreground text-xs">
                    Granted{row.enterprise_trial_by?.name ? ` by ${row.enterprise_trial_by.name}` : ""}
                    {row.enterprise_trial.started_at ? ` on ${formatDate(row.enterprise_trial.started_at)}` : ""}. Underneath:{" "}
                    {row.free_trial ? `its free ${row.trial_plan?.name ?? "Pro"} trial` : live?.entitled && live.plan ? `${live.plan.name} (${statusLabel(live.status).toLowerCase()})` : "Free"}.
                  </p>
                ) : null}
                {row && !row.free_trial && row.trial_used && !trial ? <p className="text-muted-foreground text-xs">Had its free trial{row.trial_started_at ? ` (from ${formatDate(row.trial_started_at)})` : ""}.</p> : null}
                {live && !live.complimentary ? (
                  <p className="text-xs">
                    <Link href={`/subscriptions?q=${encodeURIComponent(club.name)}`} className="text-muted-foreground underline-offset-4 hover:underline">
                      See it in Subscriptions
                    </Link>
                  </p>
                ) : null}
              </>
            )}
          </div>
          {canMoney && !isPending && !isError ? (
            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!club.is_verified}
                onClick={() => setDialog("give")}
              >
                <GiftIcon className="size-3.5" /> {live ? "Change plan" : "Give plan"}
              </button>
              {club.is_verified ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog("enterprise_trial")}>
                  <HourglassIcon className="size-3.5" /> Grant Enterprise trial
                </button>
              ) : null}
              {row && trial ? (
                <button type="button" className="btn btn-ghost btn-sm text-refuse" onClick={() => setDialog("end_trial")}>
                  <TimerOffIcon className="size-3.5" /> End trial
                </button>
              ) : null}
              {live && canEndFree(live) ? (
                <button type="button" className="btn btn-ghost btn-sm text-refuse" onClick={() => setDialog("end_free")}>
                  <BanIcon className="size-3.5" /> End free plan
                </button>
              ) : null}
              {!club.is_verified ? <span className="text-muted-foreground text-[11.5px]">Approve the club before giving it a plan.</span> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {dialog === "give" ? <GivePlanDialog club={{ id: club.id, name: club.name }} current={live} onClose={() => setDialog(null)} /> : null}
      {dialog === "end_free" && live ? <EndFreePlanDialog row={live} onClose={() => setDialog(null)} /> : null}
      {dialog === "enterprise_trial" ? <EnterpriseTrialDialog club={{ id: club.id, name: club.name }} row={row ?? null} onClose={() => setDialog(null)} /> : null}
      {dialog === "end_trial" && row ? <EndTrialDialog club={{ id: club.id, name: club.name }} row={row} onClose={() => setDialog(null)} /> : null}
    </section>
  );
}
