"use client";

import * as React from "react";
import { BanIcon, HourglassIcon, Loader2Icon, MoreHorizontalIcon, RefreshCwIcon } from "lucide-react";
import { formatDate } from "@moa/app-kit";
import {
  Button,
  ChoiceCard,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Notice,
} from "@moa/ui";

import { useCancelSubscription, useExtendGrace, useRetryCharge } from "../queries";
import { GRACE_DAYS, graceDaysProblem, inGrace, type Subscription } from "../schemas";

/**
 * What an admin can do to one subscription: ask Razorpay to retry a failed
 * charge, give a club in grace more days to pay, or cancel it (now, or when
 * the period ends). Only for roles that handle money; the caller decides.
 */
export function canRetry(row: Subscription): boolean {
  return Boolean(row.razorpay_subscription_id) && (row.status === "past_due" || inGrace(row));
}

/** Only a past-due row: the server refuses any other (422 NOT_PAST_DUE, or NEVER_PAID for one never paid). */
export function canExtendGrace(row: Subscription): boolean {
  return row.status === "past_due";
}

export function canCancel(row: Subscription): boolean {
  return row.status !== "cancelled";
}

const DAY_MS = 86_400_000;

export function SubscriptionActions({ row }: { row: Subscription }) {
  const retry = useRetryCharge();
  const [dialog, setDialog] = React.useState<"grace" | "cancel" | null>(null);
  const club = row.club?.name ?? "this club";
  const actions = { retry: canRetry(row), grace: canExtendGrace(row), cancel: canCancel(row) };
  if (!actions.retry && !actions.grace && !actions.cancel) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${club}`}
            className="border-line bg-surface text-ink-2 hover:bg-sunken hover:text-ink grid size-8 shrink-0 place-items-center rounded-full border transition-colors"
          >
            {retry.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <MoreHorizontalIcon className="size-4" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {actions.retry ? (
            <DropdownMenuItem disabled={retry.isPending} onClick={() => retry.mutate(row.id)}>
              <RefreshCwIcon className="size-4" /> Retry charge
            </DropdownMenuItem>
          ) : null}
          {actions.grace ? (
            <DropdownMenuItem onClick={() => setDialog("grace")}>
              <HourglassIcon className="size-4" /> Extend grace
            </DropdownMenuItem>
          ) : null}
          {actions.cancel ? (
            <>
              {actions.retry || actions.grace ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem variant="destructive" onClick={() => setDialog("cancel")}>
                <BanIcon className="size-4" /> Cancel
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === "grace" ? <ExtendGraceDialog row={row} onClose={() => setDialog(null)} /> : null}
      {dialog === "cancel" ? <CancelDialog row={row} onClose={() => setDialog(null)} /> : null}
    </>
  );
}

/** More days to pay, 1 to 30, counted from when the grace now ends. */
function ExtendGraceDialog({ row, onClose }: { row: Subscription; onClose: () => void }) {
  const extend = useExtendGrace();
  const [days, setDays] = React.useState("7");
  const [touched, setTouched] = React.useState(false);
  const n = Number(days);
  const problem = days.trim() === "" ? "How many days?" : graceDaysProblem(n);
  const from = row.grace_ends_at ? new Date(row.grace_ends_at) : new Date();
  const until = problem ? null : new Date(from.getTime() + n * DAY_MS);
  const club = row.club?.name ?? "The club";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    extend.mutate({ subscriptionId: row.id, days: n }, { onSuccess: onClose });
  };
  const refused = extend.error instanceof Error ? extend.error.message : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Extend grace for {club}</DialogTitle>
            <DialogDescription>
              {row.grace_ends_at ? `Grace runs until ${formatDate(row.grace_ends_at)}.` : "The charge failed and no grace has started yet."} The club keeps {row.plan?.name ?? "its plan"} while it lasts, then moves to Free unless a payment lands.
            </DialogDescription>
          </DialogHeader>
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">More days</span>
            <input
              className="input w-[120px]"
              type="number"
              inputMode="numeric"
              min={GRACE_DAYS.min}
              max={GRACE_DAYS.max}
              step={1}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={touched && problem ? true : undefined}
              aria-describedby="grace-days-help"
            />
            <span id="grace-days-help" className={touched && problem ? "text-refuse text-[12px]" : "text-ink-3 text-[12px]"}>
              {touched && problem ? problem : until ? `Grace would run until ${formatDate(until)}.` : `${GRACE_DAYS.min} to ${GRACE_DAYS.max} days.`}
            </span>
          </label>
          {/* The server's words (NOT_PAST_DUE, NEVER_PAID): nothing was changed. */}
          {refused ? <Notice tone="refuse">{refused.replace(/\.$/, "")}. Nothing was changed.</Notice> : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Keep as is
            </Button>
            <Button type="submit" disabled={extend.isPending}>
              {extend.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null} Extend grace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Cancel now, or let it run to the end of what was paid for; said plainly before it happens. */
function CancelDialog({ row, onClose }: { row: Subscription; onClose: () => void }) {
  const cancel = useCancelSubscription();
  // Already set to end with its period: the only thing left is ending it now.
  const [when, setWhen] = React.useState<"period_end" | "now">(row.cancel_at_period_end ? "now" : "period_end");
  const club = row.club?.name ?? "The club";
  const plan = row.plan?.name ?? "its plan";
  const end = row.current_period_end ? formatDate(row.current_period_end) : null;
  // The server's words (NOTHING_TO_CANCEL, RAZORPAY_ERROR): nothing was changed.
  const refused = cancel.error instanceof Error ? cancel.error.message : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Cancel {club}&apos;s subscription?</DialogTitle>
          <DialogDescription>Razorpay stops charging the club. It cannot be undone here; the club would have to subscribe again.</DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label="When" className="flex flex-col gap-2">
          <ChoiceCard
            checked={when === "period_end"}
            disabled={row.cancel_at_period_end}
            onClick={() => setWhen("period_end")}
            title="At the end of the period"
            hint={row.cancel_at_period_end ? "Already set to end with its period." : `${club} keeps ${plan}${end ? ` until ${end}` : " until the period ends"}, then moves to Free.`}
          />
          <ChoiceCard checked={when === "now"} onClick={() => setWhen("now")} title="Now" hint={`${club} moves to Free at once. Nothing more is charged.`} />
        </div>
        {refused ? <Notice tone="refuse">{refused.replace(/\.$/, "")}. Nothing was changed.</Notice> : null}
        {when === "now" && row.status === "active" ? <Notice tone="caution">They have paid{end ? ` until ${end}` : " for this period"}. Ending it now takes away what they paid for; any refund is done in Razorpay.</Notice> : null}
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Keep it
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate({ subscriptionId: row.id, atPeriodEnd: when === "period_end" }, { onSuccess: onClose })}
          >
            {cancel.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null} {when === "now" ? "Cancel now" : "Cancel at period end"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
