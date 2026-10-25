"use client";

import * as React from "react";
import { BanIcon, Loader2Icon } from "lucide-react";
import { ApiError } from "@moa/api";
import { formatCurrency, formatNumber } from "@moa/app-kit";
import {
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Notice,
  Skeleton,
} from "@moa/ui";

import { useCancelEvent, useCancelState } from "../queries";
import { CANCEL_PREVIEW_STALE, REASON_MAX, REASON_MIN, type CancelState } from "../schemas";

const label = "eyebrow mb-1.5 block";

function n(count: number, one: string, many: string) {
  return `${formatNumber(count)} ${count === 1 ? one : many}`;
}

/** What cancelling does, in the counts the server gave: the confirm step. */
function WhatHappens({ s }: { s: CancelState }) {
  return (
    <ul className="text-ink-2 grid gap-1.5 text-[13px]" aria-label="What cancelling does">
      <li>
        <span className="text-ink font-medium">{n(s.registrations, "registered guest is", "registered guests are")}</span> told it&apos;s
        cancelled — by email, in the app, and on WhatsApp where they asked for it.
      </li>
      {s.paid_online > 0 ? (
        <li>
          <span className="text-ink font-medium">{n(s.paid_online, "online payment", "online payments")}</span> refunded in full —{" "}
          <span className="text-ink font-medium">{formatCurrency(s.refund_total)}</span> — through the Razorpay account each was paid into.
        </li>
      ) : (
        <li>No online payments to refund.</li>
      )}
      {s.paid_at_door > 0 ? (
        <li>
          {n(s.paid_at_door, "guest", "guests")} paid at the door ({formatCurrency(s.paid_at_door_total)}): give that back by hand.
        </li>
      ) : null}
      <li>Registrations close, and the event shows as Cancelled on the website and in the app. This can&apos;t be undone.</li>
    </ul>
  );
}

/**
 * Cancel an event that people registered for: a reason, the counts of what
 * it will do (guests told, payments refunded, cash to give back by hand), and
 * an explicit confirmation. The counts are sent back with the request, and
 * the server refuses (CANCEL_PREVIEW_STALE) if they changed meanwhile.
 */
export function CancelEventDialog({
  eventId,
  eventName,
  open,
  onOpenChange,
}: {
  eventId: number;
  eventName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const preview = useCancelState(eventId, open);
  const cancel = useCancelEvent(eventId);
  const [reason, setReason] = React.useState("");
  const [sure, setSure] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [problem, setProblem] = React.useState<{ tone: "caution" | "refuse"; text: string } | null>(null);

  React.useEffect(() => {
    if (open) {
      setReason("");
      setSure(false);
      setError(null);
      setProblem(null);
    }
  }, [open]);

  const s = preview.data;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!s) return;
    setProblem(null);
    if (reason.trim().length < REASON_MIN) {
      setError("Say why, in a sentence. Guests see it.");
      return;
    }
    setError(null);
    try {
      await cancel.mutateAsync({ reason: reason.trim(), expected_registrations: s.registrations, expected_refund_total: s.refund_total });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.errorCode === CANCEL_PREVIEW_STALE) {
        setSure(false);
        await preview.refetch();
        setProblem({ tone: "caution", text: "Something changed since you opened this — someone registered, paid or was refunded. Check the numbers again." });
        return;
      }
      setProblem({ tone: "refuse", text: err instanceof Error ? err.message : "Could not cancel the event. Please try again." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Cancel “{eventName}”?</DialogTitle>
            <DialogDescription>Cancelling tells every guest and gives online payments back. It stays cancelled.</DialogDescription>
          </DialogHeader>
          {preview.isPending ? (
            <Skeleton className="h-[120px]" />
          ) : preview.isError ? (
            <Notice tone="refuse">{preview.error instanceof Error ? preview.error.message : "Could not read what cancelling would do."}</Notice>
          ) : !s ? (
            <Notice tone="neutral">Cancelling an event isn&apos;t available yet.</Notice>
          ) : s.cancelled ? (
            <Notice tone="neutral">This event is already cancelled.</Notice>
          ) : !s.can_cancel ? (
            <Notice tone="caution">{s.blocked_reason ?? "This event can't be cancelled."}</Notice>
          ) : (
            <>
              <WhatHappens s={s} />
              <div>
                <label htmlFor="cancel-reason" className={label}>
                  Why it&apos;s cancelled (guests see this)
                </label>
                <textarea
                  id="cancel-reason"
                  className="input min-h-[80px] w-full py-2"
                  maxLength={REASON_MAX}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. The venue is closed for repairs. We're sorry, and we'll be back with a new date."
                />
                {error ? <p className="text-refuse mt-1 text-[12px]">{error}</p> : null}
              </div>
              <label className="text-ink-2 flex items-start gap-2.5 text-[13px]">
                <Checkbox checked={sure} onCheckedChange={(v) => setSure(v === true)} aria-label="I understand this can't be undone" className="mt-0.5" />
                <span>
                  I understand: every guest is told{s.paid_online > 0 ? `, ${formatCurrency(s.refund_total)} is refunded` : ""}, and this can&apos;t be
                  undone.
                </span>
              </label>
            </>
          )}
          {problem ? <Notice tone={problem.tone}>{problem.text}</Notice> : null}
          <DialogFooter>
            <button type="button" className="btn btn-ghost" onClick={() => onOpenChange(false)} disabled={cancel.isPending}>
              Keep the event
            </button>
            {s && !s.cancelled && s.can_cancel ? (
              <button type="submit" className="btn btn-primary btn-danger" disabled={!sure || cancel.isPending || preview.isFetching}>
                {cancel.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <BanIcon className="size-4" />}
                {cancel.isPending ? "Cancelling…" : "Cancel the event"}
              </button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
