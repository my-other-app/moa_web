"use client";

import * as React from "react";
import { Loader2Icon, Undo2Icon } from "lucide-react";
import { ApiError } from "@moa/api";
import { formatCurrency } from "@moa/app-kit";
import {
  ChoiceCard,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Notice,
} from "@moa/ui";

import { useRefundPayment } from "../queries";
import { REASON_MAX, REASON_MIN, type PaymentItem } from "../schemas";

const field = "input h-9 w-full";
const label = "eyebrow mb-1.5 block";

function newRef(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Old browsers: a v4-shaped id from Math.random is enough for a double-click guard.
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
}

/** What a refusal from the server means, for the dialog to say. */
function refusal(error: unknown): string {
  if (!(error instanceof ApiError)) return "Could not ask for the refund. Please try again.";
  if (error.errorCode === "AMOUNT_TOO_HIGH") return error.message || "That is more than is left to refund on this payment.";
  if (error.errorCode === "NOT_REFUNDABLE") return error.message || "This payment can't be refunded any more.";
  if (error.errorCode === "GATEWAY_UNAVAILABLE") return error.message || "The Razorpay account this payment went to can't be reached right now.";
  return error.message;
}

/**
 * Give a guest's money back, all of what is left or a part, with a reason
 * the club keeps. The refund goes through the account the payment went to:
 * MyOtherApp's Razorpay, or the club's own.
 */
export function RefundDialog({ eventId, payment, open, onOpenChange }: { eventId: number; payment: PaymentItem; open: boolean; onOpenChange: (open: boolean) => void }) {
  const refund = useRefundPayment(eventId);
  const [whole, setWhole] = React.useState(true);
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [problem, setProblem] = React.useState<string | null>(null);
  // One per opening (the page mounts the dialog afresh for each payment): a second click on
  // Refund sends the same request, which the server answers once.
  const [ref] = React.useState(newRef);

  const left = payment.refundable;
  const who = payment.guest_name || payment.guest_email || "this guest";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProblem(null);
    const next: Record<string, string> = {};
    const value = Number(amount);
    if (!whole) {
      if (!amount.trim() || Number.isNaN(value) || value <= 0) next.amount = "Enter how much to give back";
      else if (!/^\d+(\.\d{1,2})?$/.test(amount.trim())) next.amount = "Use rupees and paise, like 150.50";
      else if (value > left) next.amount = `At most ${formatCurrency(left)} is left to refund`;
    }
    if (reason.trim().length < REASON_MIN) next.reason = "Say why, in a few words. It's kept with the refund.";
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      await refund.mutateAsync({
        paymentId: payment.id,
        body: { ...(whole ? {} : { amount: value }), reason: reason.trim(), client_ref: ref },
      });
      onOpenChange(false);
    } catch (error) {
      setProblem(refusal(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Refund {who}</DialogTitle>
            <DialogDescription>
              Paid {formatCurrency(payment.amount)}
              {payment.refunded > 0 ? `, ${formatCurrency(payment.refunded)} already refunded` : ""}. It goes back through{" "}
              {payment.gateway === "club" ? "your own Razorpay account" : "MyOtherApp's Razorpay"}, to the card, UPI or bank it came from, usually
              in 5–7 working days. The guest is told.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="How much">
            <ChoiceCard checked={whole} onClick={() => setWhole(true)} title={`All of it · ${formatCurrency(left)}`} hint="Everything still on this payment" />
            <ChoiceCard checked={!whole} onClick={() => setWhole(false)} title="Part of it" hint="An amount you choose" />
          </div>
          {!whole ? (
            <div>
              <label htmlFor="refund-amount" className={label}>
                Amount (₹)
              </label>
              <input
                id="refund-amount"
                inputMode="decimal"
                className={field}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={String(left)}
                autoFocus
              />
              {errors.amount ? <p className="text-refuse mt-1 text-[12px]">{errors.amount}</p> : null}
            </div>
          ) : null}
          <div>
            <label htmlFor="refund-reason" className={label}>
              Reason
            </label>
            <textarea
              id="refund-reason"
              className="input min-h-[72px] w-full py-2"
              maxLength={REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Couldn't attend, asked before the event"
            />
            {errors.reason ? <p className="text-refuse mt-1 text-[12px]">{errors.reason}</p> : null}
          </div>
          {problem ? <Notice tone="refuse">{problem}</Notice> : null}
          <DialogFooter>
            <button type="button" className="btn btn-ghost" onClick={() => onOpenChange(false)} disabled={refund.isPending}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-danger" disabled={refund.isPending}>
              {refund.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <Undo2Icon className="size-4" />}
              {refund.isPending ? "Refunding…" : `Refund ${whole ? formatCurrency(left) : amount && !Number.isNaN(Number(amount)) ? formatCurrency(Number(amount)) : ""}`.trim()}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
