"use client";

import * as React from "react";
import { Loader2Icon, RotateCwIcon, Undo2Icon } from "lucide-react";
import { formatCurrency, formatDateTime, formatNumber } from "@moa/app-kit";
import { EmptyState, FigurePanel, Notice, Skeleton, StatTile, StatusBadge, type StatusTone } from "@moa/ui";

import { useAccess } from "@/features/access";
import { CancellationPanel } from "@/features/event-cancel";

import { useEventPayments, useRetryRefund } from "../queries";
import { STATUS_LABEL, type PaymentItem, type PaymentStatus } from "../schemas";
import { RefundDialog } from "./refund-dialog";

const TONE: Record<PaymentStatus, StatusTone> = {
  captured: "success",
  partially_refunded: "info",
  refunded: "default",
  failed: "destructive",
  authorized: "warning",
  pending: "warning",
  created: "default",
  disputed: "destructive",
};

const REFUND_LABEL = { pending: "on the way", succeeded: "refunded", failed: "failed" } as const;

function Refunds({ eventId, p }: { eventId: number; p: PaymentItem }) {
  const retry = useRetryRefund(eventId);
  if (!p.refunds.length) return null;
  return (
    <ul className="mt-1.5 grid gap-1" aria-label={`Refunds on ${p.guest_name ?? "this payment"}`}>
      {p.refunds.map((r) => (
        <li key={r.id} className="text-ink-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]">
          <span className={r.status === "failed" ? "text-refuse font-medium" : "text-ink-2"}>
            {formatCurrency(r.amount)} {REFUND_LABEL[r.status]}
          </span>
          <span>· {r.source === "cancellation" ? "event cancelled" : r.reason}</span>
          {r.by ? <span>· {r.by}</span> : null}
          {r.created_at ? <span>· {formatDateTime(r.created_at)}</span> : null}
          {r.status === "failed" && r.error ? <span className="text-refuse">· {r.error}</span> : null}
          {r.status === "failed" ? (
            <button type="button" className="btn btn-ghost btn-xs" disabled={retry.isPending} onClick={() => retry.mutate(r.id)}>
              {retry.isPending ? <Loader2Icon className="size-3 animate-spin" /> : <RotateCwIcon className="size-3" />} Try again
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * The event's payments, one row each: who paid, how much, how, when, and
 * what has been refunded; a refund of all or part of what is left, with a
 * reason; and the refunds Razorpay did not take, to try again. Owners and
 * admins only (the server's `money`). A cancelled event's notices and
 * refund progress sit on top.
 */
export function EventPaymentsPage({ eventId }: { eventId: number }) {
  const { can } = useAccess();
  const q = useEventPayments(eventId, can.money);
  const [refunding, setRefunding] = React.useState<PaymentItem | null>(null);

  if (!can.money) return <Notice tone="neutral">Payments are for the club&apos;s owner and admins.</Notice>;
  if (q.isPending) return <Skeleton className="h-[280px]" />;
  if (q.isError) return <Notice tone="refuse">{q.error instanceof Error ? q.error.message : "Could not read the payments."}</Notice>;
  if (q.data === null) return <Notice tone="neutral">Payments and refunds aren&apos;t available here yet.</Notice>;

  const { items, totals } = q.data;
  return (
    <div className="grid gap-4">
      <CancellationPanel eventId={eventId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Payments" value={formatNumber(totals.payments)} />
        <StatTile label="Taken" value={formatCurrency(totals.captured)} />
        <StatTile label="Refunded" value={formatCurrency(totals.refunded)} />
      </div>
      <FigurePanel className="p-0">
        {items.length === 0 ? (
          <EmptyState tone="muted" title="No payments yet" description="Each online payment for this event shows here, with a way to refund it." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="text-ink-3 border-line-soft border-b text-[11.5px]">
                  <th className="px-4 py-2.5 font-medium">Guest</th>
                  <th className="px-3 py-2.5 font-medium">Amount</th>
                  <th className="px-3 py-2.5 font-medium">Method</th>
                  <th className="px-3 py-2.5 font-medium">Paid</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">
                    <span className="sr-only">Refund</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="border-line-soft border-b align-top last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="text-ink font-medium">{p.guest_name || "Guest"}</div>
                      <div className="text-ink-3 text-[11.5px]">{p.guest_email ?? p.ticket_id ?? ""}</div>
                      <Refunds eventId={eventId} p={p} />
                    </td>
                    <td className="px-3 py-2.5 font-mono tabular-nums">
                      {formatCurrency(p.amount)}
                      {p.refunded > 0 ? <div className="text-ink-3 text-[11.5px]">−{formatCurrency(p.refunded)}</div> : null}
                    </td>
                    <td className="text-ink-2 px-3 py-2.5">
                      {p.method ?? "—"}
                      <div className="text-ink-3 text-[11.5px]">{p.gateway === "club" ? "Your Razorpay" : "MyOtherApp"}</div>
                    </td>
                    <td className="text-ink-2 px-3 py-2.5">{p.paid_at ? formatDateTime(p.paid_at) : "—"}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge tone={TONE[p.status]} label={STATUS_LABEL[p.status]} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {p.refundable > 0 && (p.status === "captured" || p.status === "partially_refunded") ? (
                        <button type="button" className="btn btn-secondary btn-sm" aria-label={`Refund ${p.guest_name || "this guest"}`} onClick={() => setRefunding(p)}>
                          <Undo2Icon className="size-3.5" /> Refund
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FigurePanel>
      {refunding ? (
        <RefundDialog
          eventId={eventId}
          payment={refunding}
          open
          onOpenChange={(open) => {
            if (!open) setRefunding(null);
          }}
        />
      ) : null}
    </div>
  );
}
