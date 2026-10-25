"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftIcon, BanIcon, DownloadIcon, PlusIcon } from "lucide-react";
import { ApiError } from "@moa/api";
import { formatCurrency, formatDate, formatDateTime } from "@moa/app-kit";
import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Notice,
  StatCard,
  StatusBadge,
  Textarea,
  toast,
  type DataTableColumn,
} from "@moa/ui";

import { useCan } from "@/hooks/use-can";
import { ConfirmAction } from "@/features/ops";

import { statementCsvUrl } from "../api";
import { useRecordPayout, useStatement, useVoidPayout } from "../queries";
import { feeRateLabel, type Payout, type StatementPayment } from "../schemas";
import { Money } from "./payouts-overview";

const today = () => new Date().toISOString().slice(0, 10);

/** The form, inside the dialog's content: each opening starts from the balance owed. */
function RecordPayoutForm({
  clubId,
  outstanding,
  onDone,
}: {
  clubId: number;
  outstanding: number;
  onDone: () => void;
}) {
  const record = useRecordPayout(clubId);
  const [amount, setAmount] = React.useState(
    outstanding > 0 ? outstanding.toFixed(2) : "",
  );
  const [paidOn, setPaidOn] = React.useState(today());
  const [reference, setReference] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [overBalance, setOverBalance] = React.useState<string | null>(null);

  function send(force: boolean) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0)
      return setError("Enter the amount paid");
    if (!reference.trim())
      return setError("Enter the bank reference (UTR) or cheque number");
    if (!paidOn) return setError("Enter the date it was paid");
    setError(null);
    record.mutate(
      {
        amount: Math.round(value * 100) / 100,
        paid_on: paidOn,
        reference: reference.trim(),
        note: note.trim() || undefined,
        force,
      },
      {
        onSuccess: onDone,
        onError: (e) => {
          if (e instanceof ApiError && e.errorCode === "PAYOUT_EXCEEDS_BALANCE")
            setOverBalance(e.message);
          else toast.error(e.message || "Could not record the payout");
        },
      },
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        send(false);
      }}
    >
      <DialogHeader>
        <DialogTitle>Record a payout</DialogTitle>
        <DialogDescription>
          Money MyOtherApp sent to the club, in full or in part (
          {formatCurrency(outstanding)} outstanding). It comes off the balance
          and is recorded in the activity log.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="payout-amount">Amount (₹)</Label>
          <Input
            id="payout-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="payout-date">Paid on</Label>
          <Input
            id="payout-date"
            type="date"
            max={today()}
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="payout-reference">Reference</Label>
        <Input
          id="payout-reference"
          placeholder="UTR or cheque number"
          maxLength={120}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="payout-note">Note</Label>
        <Textarea
          id="payout-note"
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      {error ? <Notice tone="refuse">{error}</Notice> : null}
      {overBalance ? (
        <Notice
          tone="caution"
          action={
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={record.isPending}
              onClick={() => send(true)}
            >
              Record anyway
            </Button>
          }
        >
          {overBalance}
        </Notice>
      ) : null}
      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          onClick={onDone}
          disabled={record.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={record.isPending}>
          Record payout
        </Button>
      </DialogFooter>
    </form>
  );
}

function RecordPayoutDialog({
  clubId,
  outstanding,
  open,
  onOpenChange,
}: {
  clubId: number;
  outstanding: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <RecordPayoutForm
          clubId={clubId}
          outstanding={outstanding}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function VoidButton({ payout }: { payout: Payout }) {
  const voidIt = useVoidPayout();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        size="xs"
        variant="ghost"
        className="text-destructive"
        onClick={() => setOpen(true)}
      >
        <BanIcon /> Void
      </Button>
      <ConfirmAction
        open={open}
        onOpenChange={setOpen}
        title={`Void the payout of ${formatCurrency(payout.amount)}?`}
        description="For a payout recorded by mistake: it stays on the statement, struck out, and no longer counts against the balance. Recorded in the activity log."
        confirmLabel="Void payout"
        destructive
        reason={{ label: "Why", placeholder: "Recorded twice, wrong club…" }}
        pending={voidIt.isPending}
        onConfirm={(reason) =>
          voidIt.mutate(
            { id: payout.id, reason },
            { onSuccess: () => setOpen(false) },
          )
        }
      />
    </>
  );
}

export function ClubStatement({ clubId }: { clubId: number }) {
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const period = { from: from || undefined, to: to || undefined };
  const { data, isPending, isError, error } = useStatement(clubId, period);
  const canMoney = useCan("manage_money");
  // The statement file is an export: EXPORT_DATA on the server, as an event's finance statement is.
  const canExport = useCan("export_data");
  const [recording, setRecording] = React.useState(false);

  if (isError) {
    return (
      <EmptyState
        tone="muted"
        title="Could not load this statement"
        description={error?.message}
      />
    );
  }

  const s = data?.summary;
  const rate = feeRateLabel(data?.fee_rate_estimate ?? 0.0236);

  const paymentColumns: DataTableColumn<StatementPayment>[] = [
    {
      key: "when",
      header: "Paid",
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {formatDateTime(row.paid_at)}
        </span>
      ),
    },
    {
      key: "event",
      header: "Event",
      cell: (row) => <span className="truncate">{row.event?.name ?? "—"}</span>,
    },
    {
      key: "id",
      header: "Payment",
      className: "hidden lg:table-cell",
      headerClassName: "hidden lg:table-cell",
      cell: (row) => (
        <code className="bg-muted rounded px-1.5 py-0.5 text-xs">
          {row.razorpay_payment_id ?? "—"}
        </code>
      ),
    },
    {
      key: "gross",
      header: "Gross",
      className: "text-right",
      headerClassName: "text-right",
      cell: (row) => <Money value={row.gross} />,
    },
    {
      key: "fee",
      header: "Fee",
      className: "text-right",
      headerClassName: "text-right",
      cell: (row) => (
        <span>
          <Money value={row.fee} negative muted />
          {row.fee_estimated ? (
            <span className="text-ink-3 ml-1 text-[11px]">est.</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "refunded",
      header: "Refunded",
      className: "text-right",
      headerClassName: "text-right",
      cell: (row) =>
        row.refunded || row.chargeback ? (
          <Money value={row.refunded + row.chargeback} negative muted />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "net",
      header: "Net",
      className: "text-right",
      headerClassName: "text-right",
      cell: (row) => <Money value={row.net} />,
    },
  ];

  const payoutColumns: DataTableColumn<Payout>[] = [
    {
      key: "date",
      header: "Paid on",
      cell: (row) => (
        <span className={row.voided ? "line-through" : undefined}>
          {formatDate(row.paid_on)}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      cell: (row) => (
        <span
          className={
            row.voided ? "text-muted-foreground line-through" : "tabular-nums"
          }
        >
          {formatCurrency(row.amount)}
        </span>
      ),
    },
    {
      key: "ref",
      header: "Reference",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-xs">{row.reference}</p>
          {row.note ? (
            <p className="text-muted-foreground truncate text-xs">{row.note}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "by",
      header: "Recorded by",
      className: "hidden md:table-cell",
      headerClassName: "hidden md:table-cell",
      cell: (row) => (
        <span className="text-muted-foreground text-xs">
          {row.created_by?.name ?? "—"}
        </span>
      ),
    },
    {
      key: "state",
      header: "",
      className: "text-right",
      cell: (row) =>
        row.voided ? (
          <span title={row.void_reason ?? undefined}>
            <StatusBadge tone="warning" label="Void" />
          </span>
        ) : canMoney ? (
          <VoidButton payout={row} />
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/payouts">
            <ArrowLeftIcon /> All clubs
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {canExport ? (
            <Button variant="outline" size="sm" asChild>
              <a href={statementCsvUrl(clubId, period)} download>
                <DownloadIcon /> Statement CSV
              </a>
            </Button>
          ) : null}
          {canMoney && data ? (
            <Button size="sm" onClick={() => setRecording(true)}>
              <PlusIcon /> Record payout
            </Button>
          ) : null}
        </div>
      </div>
      <h2 className="m-0 text-xl">{data?.club.name ?? "Club"}</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Outstanding"
          value={s ? formatCurrency(s.outstanding) : "--"}
          caption="What MyOtherApp still owes"
        />
        <StatCard
          label="Net"
          value={s ? formatCurrency(s.net) : "--"}
          caption={
            s
              ? `${formatCurrency(s.gross)} gross on ${s.payments} payments`
              : undefined
          }
        />
        <StatCard
          label="Fees, refunds, chargebacks"
          value={s ? formatCurrency(s.fees + s.refunds + s.chargebacks) : "--"}
          caption={
            s
              ? `${formatCurrency(s.fees)} fees${s.fees_estimated ? ` (${s.fees_estimated} est. at ${rate})` : ""} · ${formatCurrency(s.refunds)} refunds`
              : undefined
          }
        />
        <StatCard
          label="Paid out"
          value={s ? formatCurrency(s.paid_out) : "--"}
          caption={
            s?.last_payout_on
              ? `Last on ${formatDate(s.last_payout_on)}`
              : "Nothing yet"
          }
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="period-from">From</Label>
          <Input
            id="period-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="period-to">To</Label>
          <Input
            id="period-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <p className="text-ink-3 m-0 pb-2 text-xs">
          The balance is all-time; the dates narrow the lists and the CSV.
        </p>
      </div>
      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-base">
          Payments on MyOtherApp&apos;s Razorpay
        </h3>
        <DataTable
          columns={paymentColumns}
          data={data?.payments}
          rowKey={(row) => row.payment_log_id}
          isLoading={isPending}
          emptyMessage="No payments in this period."
        />
        {data && data.payments_total > data.payments.length ? (
          <p className="text-ink-3 m-0 text-xs">
            The newest {data.payments.length} of {data.payments_total}; the CSV
            has them all.
          </p>
        ) : null}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-base">Payouts</h3>
        <DataTable
          columns={payoutColumns}
          data={data?.payouts}
          rowKey={(row) => row.id}
          isLoading={isPending}
          emptyMessage="No payouts recorded."
        />
      </section>
      {canMoney && data ? (
        <RecordPayoutDialog
          clubId={clubId}
          outstanding={data.summary.outstanding}
          open={recording}
          onOpenChange={setRecording}
        />
      ) : null}
    </div>
  );
}
