"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { formatCurrency } from "@moa/app-kit";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Notice,
  Textarea,
} from "@moa/ui";

import { useRefundCharge } from "../queries";

type RefundableCharge = {
  id: number | string;
  amount_paise: number;
  refunded_paise: number;
  club?: { name: string } | null | undefined;
};

/** Refund a plan subscription's charge, in full (the default) or in part. */
export function ChargeRefundDialog({
  charge,
  open,
  onOpenChange,
}: {
  charge: RefundableCharge;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ChargeRefundForm charge={charge} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** The form, inside the dialog's content: closing the dialog starts it afresh. */
function ChargeRefundForm({
  charge,
  onDone,
}: {
  charge: RefundableCharge;
  onDone: () => void;
}) {
  const refund = useRefundCharge();
  const left = Math.max(0, charge.amount_paise - charge.refunded_paise) / 100;
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 3)
      return setError("Write why: it goes in the record");
    let value: number | undefined;
    if (amount.trim()) {
      value = Number(amount);
      if (!Number.isFinite(value) || value <= 0)
        return setError(
          "Enter an amount, or leave it empty for all that is left",
        );
      if (value > left)
        return setError(`Only ${formatCurrency(left)} is left to refund`);
      value = Math.round(value * 100) / 100;
    }
    setError(null);
    refund.mutate(
      { chargeId: charge.id, amount: value, reason: reason.trim() },
      { onSuccess: onDone },
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Refund a plan charge</DialogTitle>
        <DialogDescription>
          {charge.club?.name ? `${charge.club.name}: ` : ""}
          {formatCurrency(left)} of {formatCurrency(charge.amount_paise / 100)}{" "}
          is left to refund. It goes back through Razorpay, cannot be undone,
          and is recorded in the activity log. The subscription itself is not
          changed.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="charge-amount">Amount (₹)</Label>
        <Input
          id="charge-amount"
          inputMode="decimal"
          placeholder={`${left.toFixed(2)} — all that is left`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="charge-reason">Why</Label>
        <Textarea
          id="charge-reason"
          rows={2}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
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
          disabled={refund.isPending || left <= 0}
        >
          {refund.isPending ? <Loader2Icon className="animate-spin" /> : null}{" "}
          Refund
        </Button>
      </DialogFooter>
    </form>
  );
}
