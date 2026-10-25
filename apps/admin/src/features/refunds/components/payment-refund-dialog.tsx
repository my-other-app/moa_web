"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { formatCurrency, formatDateTime } from "@moa/app-kit";
import {
  Button,
  ChoiceCard,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Notice,
  Skeleton,
  Textarea,
} from "@moa/ui";

import { useRefundDetail, useRefundPaymentPart } from "../queries";
import { REFUND_KIND_WORDS, type RefundKind } from "../schemas";

/**
 * Refund part of a ticket payment: some of the ticket (the ticket stands), one
 * store order on it (its pieces go back on the shelf), or all that is left
 * (which ends the ticket, as a full refund does). Razorpay is asked first;
 * nothing changes unless it takes the refund. A reason is required, and it
 * is recorded with the refund and in the activity log.
 */
export function PaymentRefundDialog({
  paymentId,
  open,
  onOpenChange,
}: {
  paymentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <PaymentRefundForm
          paymentId={paymentId}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

/** The form, inside the dialog's content: read when opened, and started afresh each time. */
function PaymentRefundForm({
  paymentId,
  onDone,
}: {
  paymentId: string;
  onDone: () => void;
}) {
  const detail = useRefundDetail(paymentId);
  const refund = useRefundPaymentPart(paymentId);
  const [kind, setKind] = React.useState<RefundKind>("ticket");
  const [amount, setAmount] = React.useState("");
  const [orderId, setOrderId] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const d = detail.data;
  const refundable = d?.payment.refundable ?? 0;
  const orders = (d?.store_orders ?? []).filter((o) => o.refundable);
  const ticketPaid = d?.ticket?.paid_amount ?? 0;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 3)
      return setError(
        "Write why (at least a few words): it goes in the record",
      );
    if (kind === "ticket") {
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0)
        return setError("Enter how much of the ticket to give back");
      if (value >= ticketPaid)
        return setError(
          `Part of the ticket is less than the ${formatCurrency(ticketPaid)} paid. To give it all back, refund the rest.`,
        );
      setError(null);
      refund.mutate(
        { kind, amount: Math.round(value * 100) / 100, reason: reason.trim() },
        { onSuccess: onDone },
      );
      return;
    }
    if (kind === "store_order") {
      if (!orderId) return setError("Pick the store order");
      setError(null);
      refund.mutate(
        { kind, store_order_id: orderId, reason: reason.trim() },
        { onSuccess: onDone },
      );
      return;
    }
    setError(null);
    refund.mutate(
      { kind: "rest", reason: reason.trim() },
      { onSuccess: onDone },
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Refund part of this payment</DialogTitle>
        <DialogDescription>
          Through Razorpay, on the account that took it. It cannot be undone and
          is recorded in the activity log against your name.
        </DialogDescription>
      </DialogHeader>
      {detail.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : detail.isError ? (
        <Notice tone="refuse">
          {detail.error.message || "Could not read the payment"}
        </Notice>
      ) : d ? (
        <>
          <p className="text-ink-2 m-0 text-sm">
            {formatCurrency(d.payment.amount)} paid
            {d.payment.refunded
              ? `, ${formatCurrency(d.payment.refunded)} given back`
              : ""}
            : <strong>{formatCurrency(refundable)}</strong> left to refund.
          </p>
          {refundable <= 0 ? (
            <Notice tone="caution">
              Nothing is left to refund on this payment.
            </Notice>
          ) : (
            <div
              role="radiogroup"
              aria-label="What to refund"
              className="flex flex-col gap-2"
            >
              {d.ticket && ticketPaid > 0 ? (
                <ChoiceCard
                  checked={kind === "ticket"}
                  onClick={() => setKind("ticket")}
                  title={REFUND_KIND_WORDS.ticket}
                  hint={`The ticket stands. ${formatCurrency(ticketPaid)} was paid for it.`}
                />
              ) : null}
              {orders.length ? (
                <ChoiceCard
                  checked={kind === "store_order"}
                  onClick={() => setKind("store_order")}
                  title={REFUND_KIND_WORDS.store_order}
                  hint="Its pieces go back on the shelf, unless handed over."
                />
              ) : null}
              <ChoiceCard
                checked={kind === "rest"}
                onClick={() => setKind("rest")}
                title={`${REFUND_KIND_WORDS.rest} (${formatCurrency(refundable)})`}
                hint="Ends the ticket and its store orders, like a full refund."
                tone="caution"
              />
            </div>
          )}
          {refundable > 0 && kind === "ticket" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="refund-amount">Amount to give back (₹)</Label>
              <Input
                id="refund-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          ) : null}
          {refundable > 0 && kind === "store_order" ? (
            <div
              role="radiogroup"
              aria-label="Store order"
              className="flex flex-col gap-2"
            >
              {orders.map((o) => (
                <ChoiceCard
                  key={o.id}
                  checked={orderId === o.id}
                  onClick={() => setOrderId(o.id)}
                  title={o.summary || "Store order"}
                  hint={
                    o.handed_over
                      ? "Handed over already: the pieces stay with the guest"
                      : o.status === "oversold"
                        ? "Paid while sold out"
                        : undefined
                  }
                  right={formatCurrency(o.total)}
                />
              ))}
            </div>
          ) : null}
          {refundable > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="refund-reason">Why</Label>
              <Textarea
                id="refund-reason"
                rows={2}
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          ) : null}
          {d.refunds.length ? (
            <div className="flex flex-col gap-1">
              <p className="text-ink-3 m-0 text-xs font-medium">
                Refunded before
              </p>
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs">
                {d.refunds.map((r) => (
                  <li key={r.id}>
                    {formatCurrency(r.amount)} ·{" "}
                    {REFUND_KIND_WORDS[r.kind] ?? r.kind} · {r.reason}
                    <span className="text-ink-3">
                      {" "}
                      — {r.by ?? "an admin"}, {formatDateTime(r.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
      {error ? <Notice tone="refuse">{error}</Notice> : null}
      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          onClick={onDone}
          disabled={refund.isPending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="destructive"
          disabled={refund.isPending || !d || refundable <= 0}
        >
          {refund.isPending ? <Loader2Icon className="animate-spin" /> : null}{" "}
          Refund
        </Button>
      </DialogFooter>
    </form>
  );
}
